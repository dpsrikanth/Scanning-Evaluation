using System.Configuration;

namespace ScannerApp.Utils
{
    /// <summary>
    /// Centralised access to <c>ScannerApp.exe.config</c> settings.
    /// Each property falls back to a sensible default when the key is missing
    /// or blank so the app still works without a deployed config file.
    /// </summary>
    public static class AppConfig
    {
        private const string DefaultApiBaseUrl         = "http://localhost:4000";
        private const string DefaultBarcodeApiBaseUrl  = "http://localhost:8787";
        private const string DefaultLocalStoragePath_  = @"C:\ScanOutput";

        public static string ApiBaseUrl =>
            Read("ApiBaseUrl", DefaultApiBaseUrl).TrimEnd('/');

        public static string BarcodeApiBaseUrl =>
            Read("BarcodeApiBaseUrl", DefaultBarcodeApiBaseUrl).TrimEnd('/');

        public static bool UseServerBarcode =>
            ReadBool("UseServerBarcode", defaultValue: false);

        public static string DefaultLocalStoragePath =>
            Read("DefaultLocalStoragePath", DefaultLocalStoragePath_);

        /// <summary>Optional folder where unread barcode crops are dumped. Empty disables the dump.</summary>
        public static string BarcodeFailureCropDir =>
            Read("BarcodeFailureCropDir", string.Empty);

        // ── helpers ────────────────────────────────────────────────────────────

        private static string Read(string key, string fallback)
        {
            try
            {
                var v = ConfigurationManager.AppSettings[key];
                return string.IsNullOrWhiteSpace(v) ? fallback : v.Trim();
            }
            catch
            {
                return fallback;
            }
        }

        private static bool ReadBool(string key, bool defaultValue)
        {
            var v = Read(key, defaultValue ? "true" : "false");
            return v.Equals("true",  StringComparison.OrdinalIgnoreCase)
                || v.Equals("1",     StringComparison.OrdinalIgnoreCase)
                || v.Equals("yes",   StringComparison.OrdinalIgnoreCase);
        }
    }
}
