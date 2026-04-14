using System.Drawing;
using System.Windows.Forms;

namespace ScannerApp.Services
{
    /// <summary>
    /// Non-blocking system notifications via the shell notification area (balloon / toast-style banner).
    /// </summary>
    public sealed class DesktopNotifier : IDisposable
    {
        private readonly NotifyIcon _icon;
        private bool _disposed;

        public DesktopNotifier(Icon? appIcon)
        {
            _icon = new NotifyIcon
            {
                Icon     = appIcon ?? SystemIcons.Application,
                Text     = "Scanning Station",
                Visible  = true,
            };
        }

        /// <summary>Show a notification near the taskbar clock (typically 3–30 s).</summary>
        public void Show(string title, string body, ToolTipIcon icon = ToolTipIcon.Info, int timeoutMs = 8000)
        {
            if (_disposed) return;
            title = Truncate(title, 63);
            body  = Truncate(body, 512);
            timeoutMs = Math.Clamp(timeoutMs, 3000, 30000);
            _icon.BalloonTipTitle = title;
            _icon.BalloonTipText  = body;
            _icon.BalloonTipIcon  = icon;
            _icon.ShowBalloonTip(timeoutMs);
        }

        private static string Truncate(string s, int max)
        {
            if (string.IsNullOrEmpty(s) || s.Length <= max) return s;
            return s[..(max - 1)] + "…";
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            try
            {
                _icon.Visible = false;
                _icon.Dispose();
            }
            catch { /* ignore */ }
        }
    }
}
