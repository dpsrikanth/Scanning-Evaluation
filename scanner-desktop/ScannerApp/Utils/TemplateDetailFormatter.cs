using System.Text;
using Newtonsoft.Json;
using ScannerApp.Models;

namespace ScannerApp.Utils
{
    /// <summary>Builds a full text summary of a scan template for the operator UI.</summary>
    public static class TemplateDetailFormatter
    {
        public static string BuildDetailText(ScanTemplate t, bool deskewTrimAppChecked)
        {
            var sb = new StringBuilder();
            sb.AppendLine(t.TemplateName);
            if (!string.IsNullOrWhiteSpace(t.Description))
                sb.AppendLine($"Description: {t.Description}");
            sb.AppendLine($"Pages: {t.PageCount}  •  Duplex: {t.DuplexMode}");
            sb.AppendLine($"DPI: {t.DPI}  •  Color: {t.ColorMode}  •  Paper: {t.PageSize}");
            sb.AppendLine($"Img JPEG quality: {t.JpegQuality}%");
            var b = t.BrightnessAdj == 128 ? "128 (neutral)" : t.BrightnessAdj.ToString();
            var c = t.ContrastAdj == 128 ? "128 (neutral)" : t.ContrastAdj.ToString();
            sb.AppendLine($"Brightness: {b}  •  Contrast: {c}");
            if (t.ColorMode.Equals("BlackWhite", StringComparison.OrdinalIgnoreCase))
                sb.AppendLine($"B/W threshold: {t.Threshold}");
            sb.AppendLine($"Skip blank pages: {(t.SkipBlankPages ? "Yes" : "No")}");
            sb.AppendLine($"Template scanner de-skew: {(t.DeSkew ? "Yes" : "No")}");
            sb.AppendLine($"App deskew & trim: {(deskewTrimAppChecked ? "Yes" : "No")}");
            var pdfDpi = t.PdfMaxDpi == 0 ? "native" : t.PdfMaxDpi.ToString();
            sb.AppendLine($"PDF JPEG: {t.PdfJpegQuality}%  •  PDF max DPI: {pdfDpi}");
            sb.AppendLine($"Filename pattern: {(string.IsNullOrWhiteSpace(t.PdfFilenameFormat) ? "(default)" : t.PdfFilenameFormat)}");
            sb.AppendLine($"Footer page# check from page: {t.BarcodeStartPage}");
            sb.AppendLine($"Upload: {FormatSchedule(t.UploadScheduleMode, t.UploadScheduleParam)}");
            sb.AppendLine();
            sb.AppendLine("Barcode / QR zones (% of page):");
            sb.AppendLine("Reserved: \"pageserialno\" / \"pagevalno\" — scope \"First page\" = same % footer box on every page ≥ footer start; \"From page #\" = from max(template start, N) onward.");
            AppendZones(sb, t.BarcodeZonesJson);
            return sb.ToString().TrimEnd();
        }

        private static string FormatSchedule(string? mode, string? param)
        {
            var m = (mode ?? "immediate").Trim();
            var p = string.IsNullOrWhiteSpace(param) ? "" : $" (param: {param.Trim()})";
            return m.ToLowerInvariant() switch
            {
                "immediate" => "Immediate" + p,
                "end_of_day" or "endofday" or "eod" or "eod_2300" => "End of day (23:00)" + p,
                "every_4h" or "every_4_hours" => "Every 4 hours" + p,
                "every_8h" or "every_8_hours" => "Every 8 hours" + p,
                "every_12h" or "every_12_hours" => "Every 12 hours" + p,
                "custom" => "Custom delay (minutes)" + p,
                _ => m + p,
            };
        }

        private static void AppendZones(StringBuilder sb, string? zonesJson)
        {
            if (string.IsNullOrWhiteSpace(zonesJson))
            {
                sb.AppendLine("  (none — full-page / heuristics on page 1)");
                return;
            }

            List<TemplateBarcodeZone>? zones;
            try
            {
                zones = JsonConvert.DeserializeObject<List<TemplateBarcodeZone>>(zonesJson);
            }
            catch
            {
                sb.AppendLine("  (invalid JSON)");
                return;
            }

            if (zones == null || zones.Count == 0)
            {
                sb.AppendLine("  (none — full-page / heuristics on page 1)");
                return;
            }

            sb.AppendLine("  name | scope | page | X% Y% W% H% | hint");
            foreach (var z in zones)
            {
                var scope = z.PageScope.Equals("fromPage", StringComparison.OrdinalIgnoreCase) ? $"from #{z.PageNumber}" : "first";
                sb.AppendLine($"  {z.ZoneName} | {scope} | {z.PageNumber} | {z.XPct:0.#} {z.YPct:0.#} {z.WPct:0.#} {z.HPct:0.#} | {z.Hint}");
            }
        }

        public static List<TemplateBarcodeZone>? TryParseZones(string? zonesJson)
        {
            if (string.IsNullOrWhiteSpace(zonesJson)) return null;
            try
            {
                return JsonConvert.DeserializeObject<List<TemplateBarcodeZone>>(zonesJson);
            }
            catch
            {
                return null;
            }
        }
    }
}
