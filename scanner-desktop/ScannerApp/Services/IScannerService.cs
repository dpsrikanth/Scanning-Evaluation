using System.Drawing;
using ScannerApp.Models;

namespace ScannerApp.Services
{
    /// <summary>
    /// Abstraction over scanner hardware drivers (WIA or TWAIN).
    /// Implementations: <see cref="ScannerService"/> (WIA) and <see cref="TwainScannerService"/> (TWAIN).
    /// </summary>
    public interface IScannerService
    {
        /// <summary>Returns the display names of all available scanners on this machine.</summary>
        IList<string> GetAvailableScanners();

        /// <summary>
        /// WIA: USB / local-bus devices first, then network (WSD) if no local scanners exist.
        /// TWAIN: same order as <see cref="GetAvailableScanners"/>.
        /// </summary>
        IList<string> GetAvailableScannersPreferPhysical();

        /// <summary>
        /// Scans one booklet using the settings from <paramref name="template"/>.
        /// Acquires up to <c>template.PageCount</c> pages (or until ADF is empty).
        /// Each acquired page is reported to <paramref name="progress"/> immediately,
        /// allowing the UI to display pages as they arrive.
        /// </summary>
        /// <param name="scannerName">The display name of the scanner to use.</param>
        /// <param name="template">Scan settings bundle from the admin-configured template.</param>
        /// <param name="source">Hardware source: feeder duplex, feeder simplex, or flatbed glass.</param>
        /// <param name="cancellationToken">Optional cancellation.</param>
        /// <param name="progress">Optional callback invoked for each page as it is scanned.</param>
        /// <returns>Ordered list of <see cref="Bitmap"/> objects, one per acquired page.</returns>
        Task<IList<Bitmap>> ScanBookletAsync(
            string scannerName,
            ScanTemplate template,
            ScanSource source = ScanSource.FeederDuplex,
            CancellationToken cancellationToken = default,
            IProgress<Bitmap>? progress = null);

        /// <summary>
        /// Returns true if at least one scanner is visible/reachable on this machine.
        /// Should be fast and non-blocking (no driver session opened if avoidable).
        /// </summary>
        bool IsConnected();
    }
}
