namespace ScannerApp.Utils
{
    /// <summary>
    /// Simple thread-safe rolling file logger.
    /// Writes to %AppData%\ScannerApp\logs\scanner_YYYY-MM-DD.log.
    /// Log files older than 7 days are deleted automatically on startup.
    /// </summary>
    public static class AppLogger
    {
        private static readonly string LogDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "ScannerApp", "logs");

        private static readonly object _lock = new();

        static AppLogger()
        {
            try
            {
                Directory.CreateDirectory(LogDir);
                PurgeOldLogs();
            }
            catch { /* non-fatal */ }
        }

        // ── Public API ────────────────────────────────────────────────────────

        public static void Info(string message)  => Write("INFO ", message);
        public static void Warn(string message)  => Write("WARN ", message);
        public static void Error(string message) => Write("ERROR", message);
        public static void Debug(string message) => Write("DEBUG", message);

        public static void Error(string message, Exception ex)
            => Write("ERROR", $"{message} | {ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}");

        /// <summary>Returns the path to today's log file.</summary>
        public static string TodayLogPath =>
            Path.Combine(LogDir, $"scanner_{DateTime.Now:yyyy-MM-dd}.log");

        // ── Internal ──────────────────────────────────────────────────────────

        private static void Write(string level, string message)
        {
            var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] [{level}] {message}{Environment.NewLine}";
            lock (_lock)
            {
                try { File.AppendAllText(TodayLogPath, line); }
                catch { /* if we can't log, we can't do much */ }
            }
        }

        private static void PurgeOldLogs()
        {
            var cutoff = DateTime.Now.AddDays(-7);
            foreach (var f in Directory.GetFiles(LogDir, "scanner_*.log"))
            {
                try
                {
                    if (File.GetLastWriteTime(f) < cutoff)
                        File.Delete(f);
                }
                catch { }
            }
        }
    }
}
