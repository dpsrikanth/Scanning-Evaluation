namespace ScannerApp.Models
{
    /// <summary>Scan source selection — mirrors the three options in the WIA common dialog.</summary>
    public enum ScanSource
    {
        FeederDuplex,   // Feeder (Scan both sides)  — WIA: FEEDER|DUPLEX = 6
        FeederSimplex,  // Feeder (Scan one side)    — WIA: FEEDER = 2
        Flatbed,        // Flatbed Glass             — WIA: FLATBED = 1
    }

    public class LoginRequest
    {
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
        public string Source { get; set; } = "scan";
    }

    public class LoginResponse
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public LoginData? Data { get; set; }
    }

    public class LoginData
    {
        public string Token { get; set; } = "";
        public UserInfo? User { get; set; }
    }

    public class UserInfo
    {
        public int UserId { get; set; }
        public string Username { get; set; } = "";
        public string FullName { get; set; } = "";
        public string RoleName { get; set; } = "";
        public int? LocationId { get; set; }
    }

    public class ApiResponse<T>
    {
        public bool Success { get; set; }
        public string Message { get; set; } = "";
        public T? Data { get; set; }
    }

    /// <summary>Rows from GET /api/scan/rejected-booklets (vendor or customer QC rejected).</summary>
    public class QcRejectedRow
    {
        public string BookletID { get; set; } = "";
        public int PaperID { get; set; }
        public string PaperCode { get; set; } = "";
        public string PaperName { get; set; } = "";
        public string ScanDate { get; set; } = "";
        public string VendorQcStatus { get; set; } = "";
        public string VendorQcReason { get; set; } = "";
        public string CustomerQcStatus { get; set; } = "";
        public string CustomerQcReason { get; set; } = "";
    }

    public class ScanSettings
    {
        public LocationInfo? Location { get; set; }
        public List<ExamInfo> Exams { get; set; } = new();
        public List<PaperInfo> Papers { get; set; } = new();
        public List<WorkstationInfo> Workstations { get; set; } = new();
        public List<ScanTemplate> Templates { get; set; } = new();
        public List<PrinterProfile> PrinterProfiles { get; set; } = new();
        public ScanDefaults? Defaults { get; set; }
    }

    public class LocationInfo
    {
        public int LocationID { get; set; }
        public string LocationCode { get; set; } = "";
        public string LocationName { get; set; } = "";
    }

    public class ExamInfo
    {
        public int ExamID { get; set; }
        public string ExamCode { get; set; } = "";
        public string ExamName { get; set; } = "";
        public int ExamYear { get; set; }

        public override string ToString() =>
            string.IsNullOrWhiteSpace(ExamName)
                ? ExamCode
                : $"{ExamCode}  —  {ExamName}";
    }

    public class PaperInfo
    {
        public int PaperID { get; set; }
        public int ExamID { get; set; }
        public string PaperCode { get; set; } = "";
        public string PaperName { get; set; } = "";
        public int TotalPages { get; set; }
        public string? BookletPageCounts { get; set; }

        public override string ToString() =>
            string.IsNullOrWhiteSpace(PaperName)
                ? PaperCode
                : $"{PaperCode}  —  {PaperName}";
    }

    public class WorkstationInfo
    {
        public int WorkstationID { get; set; }
        public string WorkstationCode { get; set; } = "";
        public string WorkstationName { get; set; } = "";
        public string? AssignedUsername { get; set; }
        public int? PrinterProfileID { get; set; }
        public string? PrinterProfileName { get; set; }
        public string? PrinterBrand { get; set; }
        public string? DriverType { get; set; }
        public string? TwainCapabilities { get; set; }
        public int? LocationID { get; set; }
        public string? LocationCode { get; set; }
        public string? LocationName { get; set; }

        public override string ToString() => $"{WorkstationCode} — {WorkstationName}";
    }

    public class ScanDefaults
    {
        public int Dpi { get; set; } = 300;
        public string ColorMode { get; set; } = "Grayscale";
        public string PageSize { get; set; } = "A4";
        public string DuplexMode { get; set; } = "Simplex";
        public string ImageFormat { get; set; } = "jpeg";
        public int JpegQuality { get; set; } = 85;
        /// <summary>When true, a confirmation popup is shown after each scan. Disabled by default.</summary>
        public bool ShowBookletDetailsPopup { get; set; } = false;
    }

    public class ScanTemplate
    {
        public int TemplateID { get; set; }
        public string TemplateName { get; set; } = "";
        public string Description { get; set; } = "";
        public int PageCount { get; set; } = 24;
        public int DPI { get; set; } = 300;
        public string ColorMode { get; set; } = "Grayscale";
        public string PageSize { get; set; } = "A4";
        public string DuplexMode { get; set; } = "Simplex";
        public int JpegQuality { get; set; } = 85;
        public int BrightnessAdj { get; set; } = 0;
        public int ContrastAdj { get; set; } = 0;
        public bool SkipBlankPages { get; set; } = false;
        public bool DeSkew { get; set; } = true;

        /// <summary>0-255 greyscale threshold for BlackWhite pixel mode (WIA_IPS_THRESHOLD).</summary>
        public int Threshold { get; set; } = 128;
        /// <summary>JPEG quality (1-100) used when embedding scanned images in the booklet PDF.</summary>
        public int PdfJpegQuality { get; set; } = 85;
        /// <summary>Maximum DPI for images in the booklet PDF; 0 = no downscale (preserve scan DPI).</summary>
        public int PdfMaxDpi { get; set; } = 0;

        /// <summary>PDF/booklet folder name pattern, e.g. {BookletId}, {ExamCode}_{RollNo}, {zone:barcodefilename}.</summary>
        public string? PdfFilenameFormat { get; set; }
        /// <summary>1-based page index to start footer page-number barcode checks (default 3).</summary>
        public int BarcodeStartPage { get; set; } = 3;
        /// <summary>JSON array of barcode/QR zones (see <see cref="TemplateBarcodeZone"/>).
        /// Reserved name <c>pageserialno</c> (alias <c>pagevalno</c>): per-page page-index barcode region — see <c>PageSerialZoneHelper</c> in desktop utils.</summary>
        public string? BarcodeZonesJson { get; set; }
        /// <summary>immediate | every_4h | every_8h | every_12h | end_of_day | custom</summary>
        public string UploadScheduleMode { get; set; } = "immediate";
        /// <summary>For custom mode: minimum minutes after scan before upload.</summary>
        public string? UploadScheduleParam { get; set; }

        public override string ToString() => $"{TemplateName} ({PageCount}pp)";

        public static ScanTemplate CloneFrom(ScanTemplate t) => new()
        {
            TemplateID           = t.TemplateID,
            TemplateName         = t.TemplateName,
            Description          = t.Description,
            PageCount            = t.PageCount,
            DPI                  = t.DPI,
            ColorMode            = t.ColorMode,
            PageSize             = t.PageSize,
            DuplexMode           = t.DuplexMode,
            JpegQuality          = t.JpegQuality,
            BrightnessAdj        = t.BrightnessAdj,
            ContrastAdj          = t.ContrastAdj,
            SkipBlankPages       = t.SkipBlankPages,
            DeSkew               = t.DeSkew,
            Threshold            = t.Threshold,
            PdfJpegQuality       = t.PdfJpegQuality,
            PdfMaxDpi            = t.PdfMaxDpi,
            PdfFilenameFormat    = t.PdfFilenameFormat,
            BarcodeStartPage       = t.BarcodeStartPage > 0 ? t.BarcodeStartPage : 3,
            BarcodeZonesJson     = t.BarcodeZonesJson,
            UploadScheduleMode   = string.IsNullOrWhiteSpace(t.UploadScheduleMode) ? "immediate" : t.UploadScheduleMode,
            UploadScheduleParam  = t.UploadScheduleParam,
        };
    }

    /// <summary>One barcode/QR region on a page (percent of page width/height).</summary>
    public class TemplateBarcodeZone
    {
        public string ZoneName { get; set; } = "";
        /// <summary>first | fromPage</summary>
        public string PageScope { get; set; } = "first";
        public int PageNumber { get; set; } = 1;
        public double XPct { get; set; }
        public double YPct { get; set; }
        public double WPct { get; set; }
        public double HPct { get; set; }
        /// <summary>ANY, QR_CODE, CODE_128, …</summary>
        public string Hint { get; set; } = "ANY";
    }

    public class PrinterProfile
    {
        public int ProfileID { get; set; }
        public string ProfileName { get; set; } = "";
        public string Brand { get; set; } = "Generic";
        public string DriverType { get; set; } = "WIA";
        /// <summary>JSON object mapping TWAIN CAP names to values.</summary>
        public string? TwainCapabilities { get; set; }

        public Dictionary<string, object> GetCapabilities()
        {
            if (string.IsNullOrWhiteSpace(TwainCapabilities))
                return new Dictionary<string, object>();
            try
            {
                return Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, object>>(TwainCapabilities)
                       ?? new Dictionary<string, object>();
            }
            catch { return new Dictionary<string, object>(); }
        }

        public override string ToString() => $"{ProfileName} [{DriverType}]";
    }

    public class BarcodeDetails
    {
        public string RawValue { get; set; } = "";
        public string ExamCode { get; set; } = "";
        public string PaperCode { get; set; } = "";
        public string RollNo { get; set; } = "";
        public string Serial { get; set; } = "";

        /// <summary>Parses EXAM_PAPER_ROLLNO_SERIAL barcode format.</summary>
        public static BarcodeDetails Parse(string raw)
        {
            var parts = raw.Split('_');
            return new BarcodeDetails
            {
                RawValue  = raw,
                ExamCode  = parts.Length > 0 ? parts[0] : raw,
                PaperCode = parts.Length > 1 ? parts[1] : "",
                RollNo    = parts.Length > 2 ? parts[2] : "",
                Serial    = parts.Length > 3 ? parts[3] : "",
            };
        }

        public string ToFilename() =>
            string.IsNullOrWhiteSpace(ExamCode)
                ? $"UNKNOWN_{DateTime.Now:yyyyMMdd_HHmmss}"
                : $"{ExamCode}_{PaperCode}_{RollNo}_{Serial}".Trim('_');
    }

    public class LocalBookletRecord
    {
        public string BookletId { get; set; } = "";
        public int    ExamId    { get; set; }
        public int    PaperId   { get; set; }
        public string ExamCode { get; set; } = "";
        public string PaperCode { get; set; } = "";
        public string RollNo { get; set; } = "";
        public string Serial { get; set; } = "";
        public string FolderPath { get; set; } = "";
        public string PagesJson { get; set; } = "[]";
        public string Status { get; set; } = "Pending";
        public string? ErrorReason { get; set; }
        public int AttemptCount { get; set; } = 0;
        public DateTime? LastAttempt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        /// <summary>When the operator started this scan session (local workstation time).</summary>
        public DateTime? ScanStartedAt { get; set; }
        /// <summary>When deskew/barcode/PDF finished and the booklet was written to the queue.</summary>
        public DateTime? ScanCompletedAt { get; set; }
        /// <summary>When the server accepted the upload (local time).</summary>
        public DateTime? UploadedAt { get; set; }
        public int TotalPagesExpected { get; set; }
        public int TotalPagesScanned { get; set; }
        public int WorkstationId { get; set; }
        public int LocationId { get; set; }
        public string UploadScheduleMode { get; set; } = "immediate";
        public string? UploadScheduleParam { get; set; }
        /// <summary>Driver scan duration for the booklet (ms), set when saving to queue.</summary>
        public int? ScanDurationMs { get; set; }
        /// <summary>Post-scan processing (PDF, rename, etc.) duration (ms).</summary>
        public int? ProcessingDurationMs { get; set; }
    }

    public class BarcodeLookupResult
    {
        public string BookletId { get; set; } = "";
        public bool AlreadyExists { get; set; }
        public int? ExpectedPages { get; set; }
        public string? ValidationStatus { get; set; }
    }

    public class SaveBookletRequest
    {
        public BookletData? Booklet { get; set; }
        public List<PageData> Pages { get; set; } = new();
    }

    public class BookletData
    {
        public string BookletId { get; set; } = "";
        public int ExamId { get; set; }
        public int PaperId { get; set; }
        /// <summary>Sent when IDs are 0 so the API can resolve exam/paper (queue retry + current UI selection).</summary>
        public string? ExamCode { get; set; }
        public string? PaperCode { get; set; }
        public int LocationId { get; set; }
        public string CentreCode { get; set; } = "";
        public int WorkstationId { get; set; }
        public int TotalPagesExpected { get; set; }
        public int TotalPagesScanned { get; set; }
        public string? FileHash { get; set; }
        public string FilePath { get; set; } = "";
        public string ScanDate { get; set; } = "";
    }

    public class PageData
    {
        public int PageNumber { get; set; }
        public string ImagePath { get; set; } = "";
        public string? PageHash { get; set; }
        public string? BarcodeData { get; set; }
        public string ValidationStatus { get; set; } = "Valid";
        public int IsRoughPage { get; set; }
    }
}
