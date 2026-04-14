using System.Globalization;
using System.Reflection;

namespace ScannerApp.Utils
{
    /// <summary>Reads version strings generated at build time (see ScannerApp.csproj).</summary>
    public static class AppVersion
    {
        public static string GetInformationalVersion()
        {
            var asm = typeof(AppVersion).Assembly;
            var iv = asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion?.Trim();
            if (!string.IsNullOrEmpty(iv))
                return iv;
            return asm.GetName().Version?.ToString() ?? "1.0.0";
        }

        /// <summary>Short label for window titles, e.g. <c>1.0.0</c> or <c>1.0.0 (build …)</c>.</summary>
        public static string GetDisplayLabel()
        {
            var iv = GetInformationalVersion();
            var plus = iv.IndexOf('+');
            if (plus < 0)
                return iv;
            var core = iv[..plus];
            var meta = iv[(plus + 1)..].Trim();
            var build = TryFormatBuildStamp(meta);
            return string.IsNullOrEmpty(build) ? core : $"{core} ({build})";
        }

        /// <summary>Compact prefix for title bars, e.g. <c>v1.0.0 · 2026-04-14 12:00</c>.</summary>
        public static string GetTitleSuffix()
        {
            var iv = GetInformationalVersion();
            var plus = iv.IndexOf('+');
            if (plus < 0)
                return "v" + iv;
            var core = iv[..plus];
            var meta = iv[(plus + 1)..].Trim();
            var build = TryFormatBuildStamp(meta);
            return string.IsNullOrEmpty(build) ? $"v{core}" : $"v{core} · {build}";
        }

        private static string? TryFormatBuildStamp(string meta)
        {
            if (meta.Length < 14)
                return meta.Length > 0 ? meta : null;
            var digits = meta[..14];
            if (!digits.All(char.IsDigit))
                return meta;
            if (!DateTime.TryParseExact(digits, "yyyyMMddHHmmss", CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var dt))
                return meta;
            return dt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " UTC";
        }
    }
}
