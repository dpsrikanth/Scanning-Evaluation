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
                    LocationId         INTEGER DEFAULT 0,
                    ResumeState        TEXT,
                    NextUploadAttempt  TEXT
                )";
            cmd.ExecuteNonQuery();

            // Migrations: add columns to existing databases that predate this schema
            foreach (var migration in new[] {
                "ALTER TABLE LocalQueue ADD COLUMN ErrorReason TEXT",
                "ALTER TABLE LocalQueue ADD COLUMN ExamId INTEGER DEFAULT 0",
                "ALTER TABLE LocalQueue ADD COLUMN PaperId INTEGER DEFAULT 0",
                "ALTER TABLE LocalQueue ADD COLUMN ResumeState TEXT",
                "ALTER TABLE LocalQueue ADD COLUMN NextUploadAttempt TEXT",
            })
            {
                try { using var a = conn.CreateCommand(); a.CommandText = migration; a.ExecuteNonQuery(); }
                catch { /* column already exists — ignore */ }
            }

            // Any record left in 'Scanning' state means the app crashed mid-scan → mark Interrupted
            using var fix = conn.CreateCommand();
            fix.CommandText = "UPDATE LocalQueue SET Status = 'Interrupted' WHERE Status = 'Scanning'";
            fix.ExecuteNonQuery();
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
                     TotalPagesExpected, TotalPagesScanned, WorkstationId, LocationId)
                VALUES
                    (@id, @examId, @paperId, @exam, @paper, @roll, @serial, @folder, @pages,
                     @status, @error, @attempts, @last, @created, @expected, @scanned, @ws, @loc)";

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
            cmd.ExecuteNonQuery();
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

        public List<LocalBookletRecord> GetPendingItems()
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            // Only include scheduled items whose NextUploadAttempt has passed (or is null = immediate)
            cmd.CommandText = @"
                SELECT * FROM LocalQueue
                WHERE Status IN ('Pending','Failed')
                  AND (NextUploadAttempt IS NULL OR NextUploadAttempt <= @now)
                ORDER BY CreatedAt ASC";
            cmd.Parameters.AddWithValue("@now", DateTime.Now.ToString("o"));
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
                    LastAttempt  = @last
                WHERE BookletId = @id";
            cmd.Parameters.AddWithValue("@status", status);
            cmd.Parameters.AddWithValue("@error",  (object?)errorReason ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@count",  attemptCount.HasValue ? (object)attemptCount.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@last",   DateTime.Now.ToString("o"));
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
                    LastAttempt  = NULL
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

        // ── Resume support ────────────────────────────────────────────────────

        public void MarkScanning(string bookletId, string resumeStateJson)
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = @"
                UPDATE LocalQueue
                SET Status = 'Scanning', ResumeState = @state, LastAttempt = @now
                WHERE BookletId = @id";
            cmd.Parameters.AddWithValue("@state", resumeStateJson);
            cmd.Parameters.AddWithValue("@now",   DateTime.Now.ToString("o"));
            cmd.Parameters.AddWithValue("@id",    bookletId);
            cmd.ExecuteNonQuery();
        }

        public void MarkInterrupted(string bookletId)
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = "UPDATE LocalQueue SET Status = 'Interrupted' WHERE BookletId = @id";
            cmd.Parameters.AddWithValue("@id", bookletId);
            cmd.ExecuteNonQuery();
        }

        public void UpdateResumeState(string bookletId, string resumeStateJson)
        {
            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = "UPDATE LocalQueue SET ResumeState = @state WHERE BookletId = @id";
            cmd.Parameters.AddWithValue("@state", resumeStateJson);
            cmd.Parameters.AddWithValue("@id",    bookletId);
            cmd.ExecuteNonQuery();
        }

        /// <summary>Returns the first Interrupted record, or null if none.</summary>
        public LocalBookletRecord? GetInterruptedRecord()
        {
            using var conn   = OpenConnection();
            using var cmd    = conn.CreateCommand();
            cmd.CommandText  = "SELECT * FROM LocalQueue WHERE Status = 'Interrupted' LIMIT 1";
            using var reader = cmd.ExecuteReader();
            return reader.Read() ? ReadRecord(reader) : null;
        }

        // ── Schedule-aware upload trigger ─────────────────────────────────────

        /// <summary>
        /// Called after a booklet is queued. If UploadScheduleMode is Immediate, uploads now.
        /// Otherwise schedules a NextUploadAttempt time and lets the background loop handle it.
        /// </summary>
        public void TriggerUpload(string bookletId, string uploadScheduleMode, double uploadIntervalHours)
        {
            if (uploadScheduleMode == "Immediate")
            {
                _ = TryUploadPendingAsync();
                return;
            }

            DateTime next = uploadScheduleMode switch
            {
                "Every4h"  => DateTime.Now.AddHours(4),
                "Every8h"  => DateTime.Now.AddHours(8),
                "Every12h" => DateTime.Now.AddHours(12),
                "Custom"   => DateTime.Now.AddHours(Math.Max(0.5, uploadIntervalHours)),
                "EndOfDay" => DateTime.Today.AddHours(23),
                _          => DateTime.Now,
            };

            using var conn = OpenConnection();
            using var cmd  = conn.CreateCommand();
            cmd.CommandText = "UPDATE LocalQueue SET NextUploadAttempt = @next WHERE BookletId = @id";
            cmd.Parameters.AddWithValue("@next", next.ToString("o"));
            cmd.Parameters.AddWithValue("@id",   bookletId);
            cmd.ExecuteNonQuery();
            AppLogger.Info($"TriggerUpload: {bookletId} scheduled for {next:HH:mm} ({uploadScheduleMode})");
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
                TotalPagesExpected = r["TotalPagesExpected"] is DBNull ? 0 : Convert.ToInt32(r["TotalPagesExpected"]),
                TotalPagesScanned  = r["TotalPagesScanned"]  is DBNull ? 0 : Convert.ToInt32(r["TotalPagesScanned"]),
                WorkstationId      = r["WorkstationId"] is DBNull ? 0 : Convert.ToInt32(r["WorkstationId"]),
                LocationId         = r["LocationId"]    is DBNull ? 0 : Convert.ToInt32(r["LocationId"]),
                ResumeState        = r["ResumeState"] is DBNull ? null : r["ResumeState"]?.ToString(),
            };
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
