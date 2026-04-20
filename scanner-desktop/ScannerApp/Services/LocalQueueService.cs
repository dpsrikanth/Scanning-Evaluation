using Microsoft.Data.Sqlite;
using Newtonsoft.Json;
using ScannerApp.Models;
using ScannerApp.Utils;

namespace ScannerApp.Services
{
    /// <summary>
    /// Persists scanned booklets to a local SQLite queue that survives app restarts.
    /// A background thread automatically uploads pending items when the API is reachable.
    /// </summary>
    public class LocalQueueService : IDisposable
    {
        private readonly string _dbPath;
        private readonly ApiService _api;
        private CancellationTokenSource? _cts;
        private Task? _backgroundTask;
        /// <summary>Current exam/paper from UI — applied when queue rows have ExamId/PaperId 0 (retry failed).</summary>
        private int _uploadFallbackExamId;
        private int _uploadFallbackPaperId;

        /// <summary>Raised when a booklet's status changes. Args: (bookletId, newStatus, errorReason).</summary>
        public event Action<string, string, string?>? StatusChanged;

        public void SetUploadFallback(int examId, int paperId)
        {
            _uploadFallbackExamId  = examId;
            _uploadFallbackPaperId = paperId;
        }

        public LocalQueueService(string storagePath, ApiService api)
        {
            _api    = api;
            var dir = Path.Combine(storagePath, "queue");
            Directory.CreateDirectory(dir);
            _dbPath = Path.Combine(dir, "local_queue.db");
            InitDatabase();
        }

        // ── Schema ────────────────────────────────────────────────────────────

        private void InitDatabase()
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                CREATE TABLE IF NOT EXISTS LocalQueue (
                    BookletId          TEXT PRIMARY KEY,
                    ExamId             INTEGER DEFAULT 0,
                    PaperId            INTEGER DEFAULT 0,
                    ExamCode           TEXT,
                    PaperCode          TEXT,
                    RollNo             TEXT,
                    Serial             TEXT,
                    FolderPath         TEXT,
                    PagesJson          TEXT DEFAULT '[]',
                    Status             TEXT DEFAULT 'Pending',
                    ErrorReason        TEXT,
                    AttemptCount       INTEGER DEFAULT 0,
                    LastAttempt        TEXT,
                    CreatedAt          TEXT,
                    TotalPagesExpected INTEGER DEFAULT 0,
                    TotalPagesScanned  INTEGER DEFAULT 0,
                    WorkstationId      INTEGER DEFAULT 0,
                    LocationId         INTEGER DEFAULT 0
                )";
            cmd.ExecuteNonQuery();

            // Migrations: add columns to existing databases that predate this schema
            foreach (var migration in new[] {
                "ALTER TABLE LocalQueue ADD COLUMN ErrorReason TEXT",
                "ALTER TABLE LocalQueue ADD COLUMN ExamId INTEGER DEFAULT 0",
                "ALTER TABLE LocalQueue ADD COLUMN PaperId INTEGER DEFAULT 0",
                "ALTER TABLE LocalQueue ADD COLUMN UploadScheduleMode TEXT DEFAULT 'immediate'",
                "ALTER TABLE LocalQueue ADD COLUMN UploadScheduleParam TEXT",
                "ALTER TABLE LocalQueue ADD COLUMN ScanDurationMs INTEGER",
                "ALTER TABLE LocalQueue ADD COLUMN ProcessingDurationMs INTEGER",
                "ALTER TABLE LocalQueue ADD COLUMN ScanStartedAt TEXT",
                "ALTER TABLE LocalQueue ADD COLUMN ScanCompletedAt TEXT",
                "ALTER TABLE LocalQueue ADD COLUMN UploadedAt TEXT",
            })
            {
                try { using var a = conn.CreateCommand(); a.CommandText = migration; a.ExecuteNonQuery(); }
                catch { /* column already exists — ignore */ }
            }
        }

        // ── Queue operations ──────────────────────────────────────────────────

        public void SaveToQueue(LocalBookletRecord record)
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT OR REPLACE INTO LocalQueue
                    (BookletId, ExamId, PaperId, ExamCode, PaperCode, RollNo, Serial, FolderPath, PagesJson,
                     Status, ErrorReason, AttemptCount, LastAttempt, CreatedAt,
                     TotalPagesExpected, TotalPagesScanned, WorkstationId, LocationId,
                     UploadScheduleMode, UploadScheduleParam, ScanDurationMs, ProcessingDurationMs,
                     ScanStartedAt, ScanCompletedAt, UploadedAt)
                VALUES
                    (@id, @examId, @paperId, @exam, @paper, @roll, @serial, @folder, @pages,
                     @status, @error, @attempts, @last, @created, @expected, @scanned, @ws, @loc,
                     @schedMode, @schedParam, @scanMs, @procMs,
                     @scanStarted, @scanCompleted, @uploadedAt)";

            cmd.Parameters.AddWithValue("@id",       record.BookletId);
            cmd.Parameters.AddWithValue("@examId",   record.ExamId);
            cmd.Parameters.AddWithValue("@paperId",  record.PaperId);
            cmd.Parameters.AddWithValue("@exam",     record.ExamCode);
            cmd.Parameters.AddWithValue("@paper",    record.PaperCode);
            cmd.Parameters.AddWithValue("@roll",     record.RollNo);
            cmd.Parameters.AddWithValue("@serial",   record.Serial);
            cmd.Parameters.AddWithValue("@folder",   record.FolderPath);
            cmd.Parameters.AddWithValue("@pages",    record.PagesJson);
            cmd.Parameters.AddWithValue("@status",   record.Status);
            cmd.Parameters.AddWithValue("@error",    (object?)record.ErrorReason ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@attempts", record.AttemptCount);
            cmd.Parameters.AddWithValue("@last",     record.LastAttempt?.ToString("o") ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@created",  record.CreatedAt.ToString("o"));
            cmd.Parameters.AddWithValue("@expected", record.TotalPagesExpected);
            cmd.Parameters.AddWithValue("@scanned",  record.TotalPagesScanned);
            cmd.Parameters.AddWithValue("@ws",       record.WorkstationId);
            cmd.Parameters.AddWithValue("@loc",      record.LocationId);
            cmd.Parameters.AddWithValue("@schedMode", record.UploadScheduleMode ?? "immediate");
            cmd.Parameters.AddWithValue("@schedParam", (object?)record.UploadScheduleParam ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@scanMs", record.ScanDurationMs.HasValue ? (object)record.ScanDurationMs.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@procMs", record.ProcessingDurationMs.HasValue ? (object)record.ProcessingDurationMs.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@scanStarted", record.ScanStartedAt?.ToString("o") ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@scanCompleted", record.ScanCompletedAt?.ToString("o") ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@uploadedAt", record.UploadedAt?.ToString("o") ?? (object)DBNull.Value);
            cmd.ExecuteNonQuery();
        }

        /// <summary>Loads a single queue row by booklet id, or null if missing.</summary>
        public LocalBookletRecord? GetRecord(string bookletId)
        {
            if (string.IsNullOrWhiteSpace(bookletId)) return null;
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = "SELECT * FROM LocalQueue WHERE BookletId = @id LIMIT 1";
            cmd.Parameters.AddWithValue("@id", bookletId);
            using var reader = cmd.ExecuteReader();
            return reader.Read() ? ReadRecord(reader) : null;
        }

        /// <summary>Uploads one booklet immediately (ignores deferred schedule). Used by queue row action.</summary>
        public async Task<bool> UploadBookletNowAsync(string bookletId, int fallbackExamId, int fallbackPaperId)
        {
            if (!_api.IsAuthenticated)
            {
                AppLogger.Warn($"UploadBookletNowAsync({bookletId}): not authenticated.");
                return false;
            }

            var record = GetRecord(bookletId);
            if (record == null)
            {
                AppLogger.Warn($"UploadBookletNowAsync: unknown bookletId={bookletId}");
                return false;
            }

            if (record.AttemptCount >= 5)
            {
                AppLogger.Info($"UploadBookletNowAsync: {bookletId} had max attempts — resetting for manual retry.");
                ResetForRetry(bookletId);
                record = GetRecord(bookletId)!;
            }

            AppLogger.Info($"UploadBookletNowAsync: {bookletId} (manual) pages={record.TotalPagesScanned}");
            UpdateStatus(record.BookletId, "Uploading");
            try
            {
                bool success = await _api.UploadBookletAsync(record, fallbackExamId, fallbackPaperId);
                var newStatus = success ? "Uploaded" : "Failed";
                var reason    = success ? null : "Upload returned failure";
                UpdateStatus(record.BookletId, newStatus, record.AttemptCount + 1, reason);
                return success;
            }
            catch (Exception ex)
            {
                var reason = ex.Message.Length > 200 ? ex.Message[..200] + "…" : ex.Message;
                AppLogger.Error($"UploadBookletNowAsync: {bookletId} EXCEPTION: {ex.Message}", ex);
                UpdateStatus(record.BookletId, "Failed", record.AttemptCount + 1, reason);
                return false;
            }
        }

        public List<LocalBookletRecord> GetAllRecords()
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = "SELECT * FROM LocalQueue ORDER BY CreatedAt DESC";
            using var reader = cmd.ExecuteReader();
            var results = new List<LocalBookletRecord>();
            while (reader.Read())
                results.Add(ReadRecord(reader));
            return results;
        }

        /// <summary>Returns records filtered by status. Pass null or empty to return all.</summary>
        public List<LocalBookletRecord> GetFilteredRecords(string? statusFilter)
        {
            if (string.IsNullOrWhiteSpace(statusFilter) || statusFilter == "All")
                return GetAllRecords();

            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = "SELECT * FROM LocalQueue WHERE Status = @status ORDER BY CreatedAt DESC";
            cmd.Parameters.AddWithValue("@status", statusFilter);
            using var reader = cmd.ExecuteReader();
            var results = new List<LocalBookletRecord>();
            while (reader.Read())
                results.Add(ReadRecord(reader));
            return results;
        }

        /// <summary>
        /// Returns rows whose <see cref="LocalBookletRecord.Status"/> is in <paramref name="statuses"/>.
        /// Empty <paramref name="statuses"/> yields an empty list. When all known statuses are included,
        /// uses the same ordering as <see cref="GetAllRecords"/>.
        /// </summary>
        public List<LocalBookletRecord> GetFilteredRecordsByStatuses(IReadOnlyCollection<string> statuses)
        {
            if (statuses == null || statuses.Count == 0)
                return new List<LocalBookletRecord>();

            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var s in statuses)
            {
                if (string.IsNullOrWhiteSpace(s)) continue;
                set.Add(s.Trim());
            }

            if (set.Count == 0)
                return new List<LocalBookletRecord>();

            bool coversAll = set.Contains("Pending") && set.Contains("Uploading")
                && set.Contains("Uploaded") && set.Contains("Failed");
            if (coversAll)
                return GetAllRecords();

            return GetAllRecords().Where(r => set.Contains(r.Status)).ToList();
        }

        public List<LocalBookletRecord> GetPendingItems()
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = "SELECT * FROM LocalQueue WHERE Status IN ('Pending','Failed') ORDER BY CreatedAt ASC";
            using var reader = cmd.ExecuteReader();
            var results = new List<LocalBookletRecord>();
            while (reader.Read())
                results.Add(ReadRecord(reader));
            return results;
        }

        public void UpdateStatus(string bookletId, string status, int? attemptCount = null, string? errorReason = null)
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE LocalQueue
                SET Status       = @status,
                    ErrorReason  = CASE WHEN @error IS NOT NULL THEN @error ELSE ErrorReason END,
                    AttemptCount = COALESCE(@count, AttemptCount),
                    LastAttempt  = @last,
                    UploadedAt   = CASE WHEN @status = 'Uploaded' THEN @uploadedAt ELSE UploadedAt END
                WHERE BookletId = @id";
            cmd.Parameters.AddWithValue("@status", status);
            cmd.Parameters.AddWithValue("@error",  (object?)errorReason ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@count",  attemptCount.HasValue ? (object)attemptCount.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@last",   DateTime.Now.ToString("o"));
            cmd.Parameters.AddWithValue("@uploadedAt", status == "Uploaded" ? DateTime.Now.ToString("o") : (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@id",     bookletId);
            cmd.ExecuteNonQuery();

            StatusChanged?.Invoke(bookletId, status, errorReason);
        }

        /// <summary>
        /// Resets a Failed record back to Pending so the background uploader retries it.
        /// Clears the error reason and attempt counter so it gets a fresh 5-attempt window.
        /// </summary>
        public void ResetForRetry(string bookletId)
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE LocalQueue
                SET Status       = 'Pending',
                    ErrorReason  = NULL,
                    AttemptCount = 0,
                    LastAttempt  = NULL,
                    UploadedAt   = NULL
                WHERE BookletId = @id";
            cmd.Parameters.AddWithValue("@id", bookletId);
            cmd.ExecuteNonQuery();

            AppLogger.Info($"ResetForRetry: {bookletId} reset to Pending.");
            StatusChanged?.Invoke(bookletId, "Pending", null);
        }

        /// <summary>Resets ALL Failed records back to Pending for a bulk retry.</summary>
        public int ResetAllFailed()
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE LocalQueue
                SET Status       = 'Pending',
                    ErrorReason  = NULL,
                    AttemptCount = 0,
                    LastAttempt  = NULL
                WHERE Status = 'Failed'";
            int rows = cmd.ExecuteNonQuery();
            AppLogger.Info($"ResetAllFailed: {rows} record(s) reset to Pending.");
            return rows;
        }

        public void DeleteRecord(string bookletId)
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = "DELETE FROM LocalQueue WHERE BookletId = @id";
            cmd.Parameters.AddWithValue("@id", bookletId);
            cmd.ExecuteNonQuery();
        }

        // ── Background upload ─────────────────────────────────────────────────

        public void StartBackgroundUpload()
        {
            if (_backgroundTask != null && !_backgroundTask.IsCompleted) return;
            if (_disposed) return;

            _cts = new CancellationTokenSource();
            var token = _cts.Token;
            _backgroundTask = Task.Run(async () =>
            {
                while (!token.IsCancellationRequested)
                {
                    await TryUploadPendingAsync(token);
                    try { await Task.Delay(TimeSpan.FromSeconds(30), token); }
                    catch (TaskCanceledException) { break; }
                }
            }, token);
        }

        public void StopBackgroundUpload()
        {
            try { _cts?.Cancel(); }
            catch (ObjectDisposedException) { /* already disposed — ignore */ }
        }

        public async Task TryUploadPendingAsync(CancellationToken cancellationToken = default)
        {
            if (!_api.IsAuthenticated)
            {
                AppLogger.Warn("TryUploadPendingAsync: skipped — not authenticated.");
                return;
            }

            var pending = GetPendingItems();
            AppLogger.Info($"TryUploadPendingAsync: {pending.Count} pending item(s) to upload.");

            foreach (var record in pending)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    AppLogger.Info("TryUploadPendingAsync: cancelled.");
                    break;
                }

                if (record.AttemptCount >= 5)
                {
                    AppLogger.Warn($"  Skipping {record.BookletId} — exceeded max attempts ({record.AttemptCount}/5).");
                    continue;
                }

                if (!UploadScheduleHelper.ShouldUploadNow(record))
                {
                    AppLogger.Debug($"  Deferring {record.BookletId} — upload schedule ({record.UploadScheduleMode}).");
                    continue;
                }

                AppLogger.Info($"  Uploading {record.BookletId} (attempt {record.AttemptCount + 1}/5) " +
                               $"pages={record.TotalPagesScanned}  folder={record.FolderPath}");

                UpdateStatus(record.BookletId, "Uploading");
                try
                {
                    bool success = await _api.UploadBookletAsync(record, _uploadFallbackExamId, _uploadFallbackPaperId);
                    var  newStatus = success ? "Uploaded" : "Failed";
                    var  reason    = success ? null : "Upload returned failure";

                    AppLogger.Info($"  {record.BookletId} → {newStatus}");
                    UpdateStatus(record.BookletId, newStatus, record.AttemptCount + 1, reason);
                }
                catch (Exception ex)
                {
                    var reason = ex.Message.Length > 200 ? ex.Message[..200] + "…" : ex.Message;
                    AppLogger.Error($"  {record.BookletId} upload EXCEPTION: {ex.Message}", ex);
                    UpdateStatus(record.BookletId, "Failed", record.AttemptCount + 1, reason);
                }
            }

            AppLogger.Info("TryUploadPendingAsync: done.");
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        private SqliteConnection OpenConnection()
        {
            var conn = new SqliteConnection($"Data Source={_dbPath}");
            conn.Open();
            return conn;
        }

        private static LocalBookletRecord ReadRecord(SqliteDataReader r)
        {
            return new LocalBookletRecord
            {
                BookletId          = r["BookletId"]?.ToString() ?? "",
                ExamId             = r["ExamId"]   is DBNull ? 0 : Convert.ToInt32(r["ExamId"]),
                PaperId            = r["PaperId"]  is DBNull ? 0 : Convert.ToInt32(r["PaperId"]),
                ExamCode           = r["ExamCode"]?.ToString() ?? "",
                PaperCode          = r["PaperCode"]?.ToString() ?? "",
                RollNo             = r["RollNo"]?.ToString() ?? "",
                Serial             = r["Serial"]?.ToString() ?? "",
                FolderPath         = r["FolderPath"]?.ToString() ?? "",
                PagesJson          = r["PagesJson"]?.ToString() ?? "[]",
                Status             = r["Status"]?.ToString() ?? "Pending",
                ErrorReason        = r["ErrorReason"] is DBNull ? null : r["ErrorReason"]?.ToString(),
                AttemptCount       = r["AttemptCount"] is DBNull ? 0 : Convert.ToInt32(r["AttemptCount"]),
                LastAttempt        = r["LastAttempt"] is DBNull ? null : DateTime.Parse(r["LastAttempt"].ToString()!),
                CreatedAt          = r["CreatedAt"] is DBNull ? DateTime.Now : DateTime.Parse(r["CreatedAt"].ToString()!),
                ScanStartedAt      = TryGetOptionalDateTime(r, "ScanStartedAt"),
                ScanCompletedAt    = TryGetOptionalDateTime(r, "ScanCompletedAt"),
                UploadedAt         = TryGetOptionalDateTime(r, "UploadedAt"),
                TotalPagesExpected = r["TotalPagesExpected"] is DBNull ? 0 : Convert.ToInt32(r["TotalPagesExpected"]),
                TotalPagesScanned  = r["TotalPagesScanned"]  is DBNull ? 0 : Convert.ToInt32(r["TotalPagesScanned"]),
                WorkstationId      = r["WorkstationId"] is DBNull ? 0 : Convert.ToInt32(r["WorkstationId"]),
                LocationId         = r["LocationId"]    is DBNull ? 0 : Convert.ToInt32(r["LocationId"]),
                UploadScheduleMode = TryGetOptionalString(r, "UploadScheduleMode", "immediate"),
                UploadScheduleParam = TryGetOptionalStringNullable(r, "UploadScheduleParam"),
                ScanDurationMs       = TryGetOptionalInt32(r, "ScanDurationMs"),
                ProcessingDurationMs = TryGetOptionalInt32(r, "ProcessingDurationMs"),
            };
        }

        private static DateTime? TryGetOptionalDateTime(SqliteDataReader r, string column)
        {
            try
            {
                var v = r[column];
                if (v is DBNull) return null;
                var s = v?.ToString();
                return string.IsNullOrWhiteSpace(s) ? null : DateTime.Parse(s);
            }
            catch
            {
                return null;
            }
        }

        private static int? TryGetOptionalInt32(SqliteDataReader r, string column)
        {
            try
            {
                var v = r[column];
                if (v is DBNull) return null;
                return Convert.ToInt32(v);
            }
            catch
            {
                return null;
            }
        }

        private static string TryGetOptionalString(SqliteDataReader r, string column, string fallback)
        {
            try
            {
                var v = r[column];
                if (v is DBNull) return fallback;
                return v?.ToString() ?? fallback;
            }
            catch
            {
                return fallback;
            }
        }

        private static string? TryGetOptionalStringNullable(SqliteDataReader r, string column)
        {
            try
            {
                var v = r[column];
                if (v is DBNull) return null;
                return v?.ToString();
            }
            catch
            {
                return null;
            }
        }

        private bool _disposed = false;

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            StopBackgroundUpload();
            _cts?.Dispose();
            _cts = null;
        }
    }
}
