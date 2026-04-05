using System.Text.RegularExpressions;
using ScannerApp.Models;

namespace ScannerApp.Utils
{
    public static class UploadScheduleHelper
    {
        /// <summary>Returns true when a pending queue row may be uploaded now (local time).</summary>
        public static bool ShouldUploadNow(LocalBookletRecord record)
        {
            var mode = (record.UploadScheduleMode ?? "immediate").Trim().ToLowerInvariant();
            var now = DateTime.Now;

            return mode switch
            {
                "immediate" => true,
                "end_of_day" or "endofday" or "eod" or "eod_2300" => now.Hour == 23,
                "every_4h" or "every_4_hours" => now.Hour % 4 == 0 && now.Minute < 30,
                "every_8h" or "every_8_hours" => now.Hour % 8 == 0 && now.Minute < 30,
                "every_12h" or "every_12_hours" => now.Hour % 12 == 0 && now.Minute < 30,
                "custom" => MinutesSince(record.CreatedAt, now) >= ParseMinutes(record.UploadScheduleParam, 60),
                _ => true,
            };
        }

        private static int ParseMinutes(string? param, int fallback)
        {
            if (string.IsNullOrWhiteSpace(param)) return fallback;
            return int.TryParse(param.Trim(), out var m) && m > 0 ? m : fallback;
        }

        private static double MinutesSince(DateTime created, DateTime now) =>
            (now - created).TotalMinutes;
    }

    /// <summary>Builds booklet folder IDs from <see cref="ScanTemplate.PdfFilenameFormat"/> tokens.</summary>
    public static class TemplateBookletNaming
    {
        private static readonly Regex ZoneToken = new(@"\{zone:([^}]+)\}", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        public static string BuildBookletId(
            ScanTemplate template,
            BarcodeDetails details,
            IReadOnlyDictionary<string, string> zoneValues,
            string timeStampSuffix)
        {
            var format = template.PdfFilenameFormat?.Trim();
            if (string.IsNullOrEmpty(format))
            {
                var baseId = details.ToFilename();
                return string.IsNullOrEmpty(timeStampSuffix) ? baseId : $"{baseId}_{timeStampSuffix}";
            }

            var bookletCore = details.ToFilename();
            if (bookletCore.StartsWith("UNKNOWN_", StringComparison.Ordinal))
                bookletCore = zoneValues.TryGetValue("barcodefilename", out var fn) && !string.IsNullOrWhiteSpace(fn)
                    ? SanitizeFilePart(fn)
                    : bookletCore;

            var s = format;
            s = s.Replace("{BookletId}", bookletCore, StringComparison.OrdinalIgnoreCase);
            s = s.Replace("{ExamCode}", SanitizeFilePart(details.ExamCode), StringComparison.OrdinalIgnoreCase);
            s = s.Replace("{PaperCode}", SanitizeFilePart(details.PaperCode), StringComparison.OrdinalIgnoreCase);
            s = s.Replace("{RollNo}", SanitizeFilePart(details.RollNo), StringComparison.OrdinalIgnoreCase);
            s = s.Replace("{Serial}", SanitizeFilePart(details.Serial), StringComparison.OrdinalIgnoreCase);
            s = s.Replace("{Time}", timeStampSuffix, StringComparison.OrdinalIgnoreCase);

            s = ZoneToken.Replace(s, m =>
            {
                var key = m.Groups[1].Value.Trim();
                return zoneValues.TryGetValue(key, out var v) ? SanitizeFilePart(v) : "";
            });

            s = SanitizeFilePart(s);
            if (string.IsNullOrEmpty(s))
                s = "SCAN_" + timeStampSuffix;

            if (!format.Contains("{Time}", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrEmpty(timeStampSuffix) &&
                !s.EndsWith(timeStampSuffix, StringComparison.Ordinal))
                s = $"{s}_{timeStampSuffix}";

            return s;
        }

        private static string SanitizeFilePart(string? part)
        {
            if (string.IsNullOrEmpty(part)) return "";
            var invalid = Path.GetInvalidFileNameChars();
            var chars = part.Select(c => invalid.Contains(c) ? '_' : c).ToArray();
            return new string(chars).Trim('_', ' ');
        }
    }
}
