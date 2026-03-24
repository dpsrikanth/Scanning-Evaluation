using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using ScannerApp.Models;
using ScannerApp.Utils;

namespace ScannerApp.Services
{
    public class ApiService
    {
        private readonly HttpClient _client;
        private string _token = "";

        // All outgoing JSON uses camelCase to match the Node.js API expectations
        private static readonly JsonSerializerSettings _jsonSettings = new()
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore
        };

        public string BaseUrl { get; set; } = "http://localhost:4000";
        public bool IsAuthenticated => !string.IsNullOrEmpty(_token);
        public UserInfo? CurrentUser { get; private set; }

        public ApiService()
        {
            _client = new HttpClient();
            _client.Timeout = TimeSpan.FromSeconds(120);
            AppLogger.Info($"ApiService initialised — BaseUrl={BaseUrl} Timeout=120s");
        }

        public void SetToken(string token)
        {
            _token = token;
            _client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);
            AppLogger.Info("Auth token applied to HttpClient.");
        }

        // ── Auth ──────────────────────────────────────────────────────────────

        public async Task<LoginData?> LoginAsync(string username, string password)
        {
            var url = $"{BaseUrl}/api/auth/login";
            AppLogger.Info($"POST {url} user={username}");

            var payload = new LoginRequest { Username = username, Password = password, Source = "scan" };
            var json    = JsonConvert.SerializeObject(payload, _jsonSettings);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var sw       = Stopwatch.StartNew();
            var response = await _client.PostAsync(url, content);
            var body     = await response.Content.ReadAsStringAsync();
            sw.Stop();

            AppLogger.Info($"  → {(int)response.StatusCode} {response.StatusCode} ({sw.ElapsedMilliseconds} ms) " +
                           $"responseLen={body.Length}");

            var result = JsonConvert.DeserializeObject<LoginResponse>(body);
            if (result?.Success == true && result.Data != null)
            {
                SetToken(result.Data.Token);
                CurrentUser = result.Data.User;
                AppLogger.Info($"  Login OK — user={result.Data.User?.Username}");
                return result.Data;
            }

            var msg = result?.Message ?? "Login failed";
            AppLogger.Warn($"  Login FAILED: {msg}");
            throw new Exception(msg);
        }

        // ── Settings ──────────────────────────────────────────────────────────

        public async Task<ScanSettings> GetScanSettingsAsync()
        {
            var url = $"{BaseUrl}/api/scan/settings";
            AppLogger.Info($"GET {url}");

            var sw       = Stopwatch.StartNew();
            var response = await _client.GetAsync(url);
            var body     = await response.Content.ReadAsStringAsync();
            sw.Stop();

            AppLogger.Info($"  → {(int)response.StatusCode} {response.StatusCode} ({sw.ElapsedMilliseconds} ms)");

            var result = JsonConvert.DeserializeObject<ApiResponse<ScanSettings>>(body);
            if (result?.Success == true && result.Data != null)
                return result.Data;

            var msg = result?.Message ?? "Failed to fetch settings";
            AppLogger.Warn($"  GetScanSettings FAILED: {msg}");
            throw new Exception(msg);
        }

        // ── Barcode lookup ────────────────────────────────────────────────────

        public async Task<BarcodeLookupResult> LookupBarcodeAsync(string barcodeValue)
        {
            var url = $"{BaseUrl}/api/scan/barcode/{Uri.EscapeDataString(barcodeValue)}";
            AppLogger.Debug($"GET {url}");

            var sw       = Stopwatch.StartNew();
            var response = await _client.GetAsync(url);
            var body     = await response.Content.ReadAsStringAsync();
            sw.Stop();

            AppLogger.Debug($"  → {(int)response.StatusCode} ({sw.ElapsedMilliseconds} ms)");

            var result = JsonConvert.DeserializeObject<ApiResponse<BarcodeLookupResult>>(body);
            if (result?.Success == true && result.Data != null)
                return result.Data;

            if (response.StatusCode == HttpStatusCode.Conflict)
                throw new Exception($"DUPLICATE: {result?.Message}");

            throw new Exception(result?.Message ?? "Barcode lookup failed");
        }

        // ── Workstation ───────────────────────────────────────────────────────

        public async Task<WorkstationInfo?> GetMyWorkstationAsync()
        {
            var url = $"{BaseUrl}/api/scan/my-workstation";
            AppLogger.Debug($"GET {url}");

            var sw       = Stopwatch.StartNew();
            var response = await _client.GetAsync(url);
            var body     = await response.Content.ReadAsStringAsync();
            sw.Stop();

            AppLogger.Debug($"  → {(int)response.StatusCode} ({sw.ElapsedMilliseconds} ms)");
            return JsonConvert.DeserializeObject<ApiResponse<WorkstationInfo>>(body)?.Data;
        }

        // ── Templates ─────────────────────────────────────────────────────────

        public async Task<List<ScanTemplate>> GetTemplatesAsync()
        {
            var url = $"{BaseUrl}/api/scan/templates";
            AppLogger.Debug($"GET {url}");

            var sw       = Stopwatch.StartNew();
            var response = await _client.GetAsync(url);
            var body     = await response.Content.ReadAsStringAsync();
            sw.Stop();

            AppLogger.Debug($"  → {(int)response.StatusCode} ({sw.ElapsedMilliseconds} ms)");
            return JsonConvert.DeserializeObject<ApiResponse<List<ScanTemplate>>>(body)?.Data
                   ?? new List<ScanTemplate>();
        }

        // ── Upload booklet ────────────────────────────────────────────────────

        /// <summary>POSTs the booklet JSON payload to the server.</summary>
        public async Task<bool> SaveBookletAsync(SaveBookletRequest request)
        {
            var url  = $"{BaseUrl}/api/scan/booklet";
            var json = JsonConvert.SerializeObject(request, _jsonSettings);

            AppLogger.Info($"POST {url}  payloadBytes={Encoding.UTF8.GetByteCount(json)}  " +
                           $"bookletId={request.Booklet?.BookletId}  pages={request.Pages.Count}");
            AppLogger.Debug($"  Payload JSON:\n{json}");

            var content = new StringContent(json, Encoding.UTF8, "application/json");
            content.Headers.Add("X-Workstation", Environment.MachineName);

            HttpResponseMessage response;
            string body;
            var sw = Stopwatch.StartNew();
            try
            {
                response = await _client.PostAsync(url, content);
                body     = await response.Content.ReadAsStringAsync();
            }
            catch (TaskCanceledException tcEx)
            {
                AppLogger.Error($"  POST {url} TIMED OUT after {sw.ElapsedMilliseconds} ms", tcEx);
                throw new Exception($"Upload timed out after {sw.ElapsedMilliseconds / 1000}s. " +
                                    "Check server availability.", tcEx);
            }
            catch (HttpRequestException httpEx)
            {
                AppLogger.Error($"  POST {url} NETWORK ERROR after {sw.ElapsedMilliseconds} ms", httpEx);
                throw new Exception($"Network error: {httpEx.Message}", httpEx);
            }
            sw.Stop();

            AppLogger.Info($"  → {(int)response.StatusCode} {response.StatusCode} ({sw.ElapsedMilliseconds} ms)  " +
                           $"responseLen={body.Length}");

            // Always log the response body at DEBUG level so failures are diagnosable
            AppLogger.Debug($"  Response body:\n{body}");

            ApiResponse<object>? result;
            try
            {
                result = JsonConvert.DeserializeObject<ApiResponse<object>>(body);
            }
            catch (Exception parseEx)
            {
                AppLogger.Error($"  Failed to parse response JSON: {parseEx.Message}");
                AppLogger.Error($"  Raw response (first 2000 chars): {body[..Math.Min(body.Length, 2000)]}");
                throw new Exception($"Server returned unparseable response " +
                                    $"(HTTP {(int)response.StatusCode}). See log for details.", parseEx);
            }

            if (result?.Success == true)
            {
                var serverMsg = string.IsNullOrWhiteSpace(result.Message) ? "" : $" — {result.Message}";
                AppLogger.Info($"  Upload OK — bookletId={request.Booklet?.BookletId}{serverMsg}");
                return true;
            }

            var errMsg = result?.Message ?? $"HTTP {(int)response.StatusCode}";
            AppLogger.Warn($"  Upload FAILED — server message: {errMsg}");
            AppLogger.Warn($"  Full response: {body[..Math.Min(body.Length, 1000)]}");
            throw new Exception($"Server rejected upload: {errMsg}");
        }

        /// <summary>Builds and uploads a SaveBookletRequest from a local queue record. If booklet.pdf exists, uploads it to the server.</summary>
        /// <param name="fallbackExamId">When queue row has ExamId 0, use current UI exam (retry failed uploads).</param>
        /// <param name="fallbackPaperId">When queue row has PaperId 0, use current UI paper.</param>
        public async Task<bool> UploadBookletAsync(LocalBookletRecord record, int fallbackExamId = 0, int fallbackPaperId = 0)
        {
            AppLogger.Info($"UploadBookletAsync — bookletId={record.BookletId}  " +
                           $"attempt={record.AttemptCount + 1}  " +
                           $"pages={record.TotalPagesScanned}/{record.TotalPagesExpected}  " +
                           $"folder={record.FolderPath}");

            List<PageData> pages;
            try
            {
                pages = JsonConvert.DeserializeObject<List<PageData>>(record.PagesJson)
                        ?? new List<PageData>();
                AppLogger.Debug($"  Deserialised {pages.Count} page records from PagesJson.");
            }
            catch (Exception ex)
            {
                AppLogger.Error($"  Failed to deserialise PagesJson for {record.BookletId}", ex);
                throw new Exception($"Corrupt page data in queue record: {ex.Message}", ex);
            }

            var examId  = record.ExamId  > 0 ? record.ExamId  : fallbackExamId;
            var paperId = record.PaperId > 0 ? record.PaperId : fallbackPaperId;

            var bookletData = new BookletData
            {
                BookletId          = record.BookletId,
                ExamId             = examId,
                PaperId            = paperId,
                ExamCode           = string.IsNullOrWhiteSpace(record.ExamCode)  ? null : record.ExamCode.Trim(),
                PaperCode          = string.IsNullOrWhiteSpace(record.PaperCode) ? null : record.PaperCode.Trim(),
                LocationId         = record.LocationId,
                WorkstationId      = record.WorkstationId,
                TotalPagesExpected = record.TotalPagesExpected,
                TotalPagesScanned  = record.TotalPagesScanned,
                FilePath           = record.FolderPath,
                ScanDate           = record.CreatedAt.ToString("yyyy-MM-dd"),
                CentreCode         = "",
            };

            AppLogger.Debug($"  BookletData: examId={bookletData.ExamId} paperId={bookletData.PaperId} " +
                            $"examCode={bookletData.ExamCode} paperCode={bookletData.PaperCode} " +
                            $"locationId={bookletData.LocationId} workstationId={bookletData.WorkstationId} " +
                            $"scanDate={bookletData.ScanDate}");

            var request = new SaveBookletRequest { Booklet = bookletData, Pages = pages };
            var pdfPath = Path.Combine(record.FolderPath ?? "", "booklet.pdf");
            if (File.Exists(pdfPath))
            {
                AppLogger.Info($"  Uploading with PDF: {pdfPath}");
                return await SaveBookletWithPdfAsync(request, pdfPath);
            }
            return await SaveBookletAsync(request);
        }

        private static readonly string[] BookletPdfUploadPaths = { "/api/scan/booklet-upload", "/api/scan/booklet/upload" };

        /// <summary>POSTs booklet metadata and PDF file (multipart). Tries /booklet-upload then /booklet/upload for older APIs.</summary>
        public async Task<bool> SaveBookletWithPdfAsync(SaveBookletRequest request, string pdfFilePath)
        {
            var baseUrl = BaseUrl.TrimEnd('/');
            var pdfBytes = await File.ReadAllBytesAsync(pdfFilePath);
            _client.DefaultRequestHeaders.Remove("X-Workstation");
            _client.DefaultRequestHeaders.Add("X-Workstation", Environment.MachineName);

            string? lastErr = null;
            foreach (var path in BookletPdfUploadPaths)
            {
                var url = $"{baseUrl}{path}";
                using var multipart = new MultipartFormDataContent();
                multipart.Add(new StringContent(JsonConvert.SerializeObject(request.Booklet, _jsonSettings), Encoding.UTF8, "application/json"), "booklet");
                multipart.Add(new StringContent(JsonConvert.SerializeObject(request.Pages ?? new List<PageData>(), _jsonSettings), Encoding.UTF8, "application/json"), "pages");
                var pdfContent = new ByteArrayContent(pdfBytes);
                pdfContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
                multipart.Add(pdfContent, "pdf", "booklet.pdf");

                var response = await _client.PostAsync(url, multipart);
                var body     = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    var result = JsonConvert.DeserializeObject<ApiResponse<object>>(body);
                    if (result?.Success == true)
                    {
                        var serverMsg = string.IsNullOrWhiteSpace(result.Message) ? "" : $" — {result.Message}";
                        AppLogger.Info($"  Upload with PDF OK — bookletId={request.Booklet?.BookletId}  endpoint={path}{serverMsg}");
                        return true;
                    }
                }

                lastErr = JsonConvert.DeserializeObject<ApiResponse<object>>(body)?.Message ?? $"HTTP {(int)response.StatusCode}";
                var is404 = (int)response.StatusCode == 404
                            || (lastErr != null && lastErr.Contains("not found", StringComparison.OrdinalIgnoreCase));
                if (is404 && path != BookletPdfUploadPaths[^1])
                {
                    AppLogger.Warn($"  PDF upload {path} not available, trying alternate…");
                    continue;
                }

                AppLogger.Warn($"  Upload with PDF FAILED — {lastErr}");
                throw new Exception($"Server rejected upload: {lastErr}");
            }

            throw new Exception($"Server rejected upload: {lastErr ?? "unknown"}");
        }

        /// <summary>Booklets rejected at vendor or customer QC (same location as operator).</summary>
        public async Task<List<QcRejectedRow>> GetRejectedBookletsAsync()
        {
            var url = $"{BaseUrl}/api/scan/rejected-booklets";
            AppLogger.Info($"GET {url}");
            var sw       = Stopwatch.StartNew();
            var response = await _client.GetAsync(url);
            var body     = await response.Content.ReadAsStringAsync();
            sw.Stop();
            AppLogger.Info($"  → {(int)response.StatusCode} ({sw.ElapsedMilliseconds} ms)");

            var result = JsonConvert.DeserializeObject<ApiResponse<List<QcRejectedRow>>>(body);
            if (result?.Success == true && result.Data != null)
                return result.Data;

            var msg = result?.Message ?? "Failed to load rejected booklets";
            throw new Exception(msg);
        }
    }
}
