using System.Drawing;
using NTwain;
using NTwain.Data;
using ScannerApp.Models;

namespace ScannerApp.Services
{
    /// <summary>
    /// TWAIN scanner driver implementation using NTwain 3.7.5.
    /// Provides advanced capability control for ADFS-based brand scanners
    /// (Fujitsu, Kodak, Canon, Avision, HP, etc.).
    ///
    /// Capabilities are driven by the <see cref="PrinterProfile.TwainCapabilities"/> JSON map,
    /// allowing admin-configurable per-brand settings without code changes.
    ///
    /// Standard TWAIN CAP keys supported in TwainCapabilities JSON:
    ///   ICAP_XRESOLUTION      — int (DPI, e.g. 300)
    ///   ICAP_YRESOLUTION      — int (DPI, e.g. 300)
    ///   ICAP_PIXELTYPE        — int (0=BW, 1=Gray, 2=RGB); applied from profile JSON then overridden by the scan template Colour / Grayscale / BlackWhite setting
    ///   CAP_DUPLEXENABLED     — int (0=Simplex, 1=Duplex)
    ///   ICAP_SUPPORTEDSIZES   — int (1=A4, 9=A4 landscape…)
    ///   ICAP_AUTOMATICDESKEW  — int (1=enabled, 0=disabled)
    ///   ICAP_AUTOMATICROTATE  — int (1=enabled, 0=disabled)
    ///   ICAP_BRIGHTNESS       — int (-1000 to 1000)
    ///   ICAP_CONTRAST         — int (-1000 to 1000)
    /// </summary>
    public class TwainScannerService : IScannerService
    {
        private readonly PrinterProfile? _profile;

        /// <summary>When true, the scanner driver's own UI is shown (useful for hardware troubleshooting).</summary>
        public bool UseScannerUi { get; set; }

        public TwainScannerService(PrinterProfile? profile = null)
        {
            _profile = profile;
        }

        // ── IScannerService: enumerate ────────────────────────────────────────

        public bool IsConnected()
        {
            TwainSession? session = null;
            try
            {
                session = CreateSession();
                session.Open();
                return session.Any();
            }
            catch { return false; }
            finally { TryClose(session); }
        }

        public IList<string> GetAvailableScanners()
        {
            var names = new List<string>();
            TwainSession? session = null;
            try
            {
                session = CreateSession();
                session.Open();
                foreach (var src in session)
                    names.Add(src.Name);
            }
            catch { }
            finally { TryClose(session); }
            return names;
        }

        // ── IScannerService: scan booklet ─────────────────────────────────────

        public async Task<IList<Bitmap>> ScanBookletAsync(
            string scannerName,
            ScanTemplate template,
            ScanSource source = ScanSource.FeederDuplex,
            CancellationToken cancellationToken = default,
            IProgress<Bitmap>? progress = null)
        {
            return await Task.Run(() => ScanWithTwain(scannerName, template, source, cancellationToken, progress),
                cancellationToken);
        }

        // ── Core TWAIN scan ──────────────────────────────────────────────────

        private IList<Bitmap> ScanWithTwain(
            string scannerName,
            ScanTemplate template,
            ScanSource scanSource,
            CancellationToken cancellationToken,
            IProgress<Bitmap>? progress = null)
        {
            var collectedPages = new List<Bitmap>();
            TwainSession? session = null;
            DataSource?   source  = null;

            try
            {
                session = CreateSession();

                // Wire up data transfer BEFORE opening
                session.DataTransferred += (s, e) =>
                {
                    Bitmap? bmp = null;
                    if (e.NativeData != IntPtr.Zero)
                    {
                        try { bmp = BitmapFromNativeDib(e.NativeData); } catch { }
                    }
                    else if (!string.IsNullOrEmpty(e.FileDataPath) && File.Exists(e.FileDataPath))
                    {
                        try { bmp = new Bitmap(e.FileDataPath); } catch { }
                    }
                    if (bmp != null)
                    {
                        collectedPages.Add(bmp);
                        progress?.Report(bmp);
                    }
                };

                session.Open();

                // Find requested source
                foreach (var s in session)
                {
                    if (s.Name.Equals(scannerName, StringComparison.OrdinalIgnoreCase))
                    { source = s; break; }
                }

                if (source == null)
                    throw new InvalidOperationException($"TWAIN source '{scannerName}' not found.");

                source.Open();
                ApplyCapabilities(source, template, scanSource);
                var uiMode = UseScannerUi ? SourceEnableMode.ShowUI : SourceEnableMode.NoUI;
                source.Enable(uiMode, false, IntPtr.Zero);

                // Pump the Windows message loop until all pages are transferred
                var deadline = DateTime.UtcNow.AddMinutes(5);
                while (DateTime.UtcNow < deadline && !cancellationToken.IsCancellationRequested)
                {
                    System.Windows.Forms.Application.DoEvents();
                    Thread.Sleep(50);

                    if (collectedPages.Count >= template.PageCount) break;
                    // S1=closed, S2=open, S3=src open, S4=src enabled, S5=scanning, S6/S7=transfer
                    // When state drops back to S4 or below, scanning is done
                    if (session.State < 5) break;
                }

                cancellationToken.ThrowIfCancellationRequested();
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"TWAIN scan failed: {ex.Message}", ex);
            }
            finally
            {
                try { source?.Close(); } catch { }
                TryClose(session);
            }

            return collectedPages;
        }

        // ── Apply capabilities ────────────────────────────────────────────────

        private void ApplyCapabilities(DataSource source, ScanTemplate template, ScanSource scanSource)
        {
            // Brand / driver defaults first (feeder quirks, sizes, etc.)
            if (_profile != null)
                ApplyBrandCapabilities(source, _profile.GetCapabilities());

            // Hardware source — feeder or flatbed, simplex or duplex
            bool useFeeder = scanSource != ScanSource.Flatbed;
            bool useDuplex = scanSource == ScanSource.FeederDuplex;
            if (useFeeder)
            {
                SafeSet(() => source.Capabilities.CapFeederEnabled.SetValue(BoolType.True));
                SafeSet(() => source.Capabilities.CapDuplexEnabled.SetValue(useDuplex ? BoolType.True : BoolType.False));
                SafeSet(() => source.Capabilities.CapAutoFeed.SetValue(BoolType.True));
            }
            else
            {
                SafeSet(() => source.Capabilities.CapFeederEnabled.SetValue(BoolType.False));
            }

            // Brightness / contrast — template uses 0–255 with 128 = neutral (same as WIA path).
            // Do not pass 128 as a raw TWAIN value (drivers treat ICAP_* as −1000…+1000, 0 = neutral).
            const int neutral = 128;
            int twB = Math.Clamp((template.BrightnessAdj - neutral) * 8, -1000, 1000);
            int twC = Math.Clamp((template.ContrastAdj - neutral) * 8, -1000, 1000);
            if (twB != 0)
                SafeSet(() => source.Capabilities.ICapBrightness.SetValue((TWFix32)twB));
            if (twC != 0)
                SafeSet(() => source.Capabilities.ICapContrast.SetValue((TWFix32)twC));

            // Auto de-skew
            if (template.DeSkew)
                SafeSet(() => source.Capabilities.ICapAutomaticDeskew.SetValue(BoolType.True));

            // Skip blank pages (ICAP_AUTODISCARDBLANKPAGES: Auto = -1 lets scanner decide)
            if (template.SkipBlankPages)
                SafeSet(() => source.Capabilities.ICapAutoDiscardBlankPages.SetValue(BlankPage.Auto));

            // DPI and pixel type must match the scan template (admin UI). Printer-profile JSON
            // often sets ICAP_PIXELTYPE to line-art/BW for speed — that would override Color scans.
            ApplyTemplateImageCaps(source, template);
        }

        /// <summary>
        /// Maps template colour mode to TWAIN pixel type. Case-insensitive; API may send color/grayscale/blackwhite.
        /// </summary>
        private static PixelType TemplateColorModeToPixelType(string? colorMode)
        {
            if (string.IsNullOrWhiteSpace(colorMode))
                return PixelType.Gray;
            switch (colorMode.Trim().ToLowerInvariant())
            {
                case "color":
                case "rgb":
                case "24bit":
                case "24-bit":
                    return PixelType.RGB;
                case "blackwhite":
                case "bw":
                case "lineart":
                case "black_white":
                    return PixelType.BlackWhite;
                default:
                    return PixelType.Gray;
            }
        }

        private static void ApplyTemplateImageCaps(DataSource source, ScanTemplate template)
        {
            SafeSet(() => source.Capabilities.ICapXResolution.SetValue((TWFix32)template.DPI));
            SafeSet(() => source.Capabilities.ICapYResolution.SetValue((TWFix32)template.DPI));
            var pixelType = TemplateColorModeToPixelType(template.ColorMode);
            SafeSet(() => source.Capabilities.ICapPixelType.SetValue(pixelType));

            // Some drivers (e.g. Fujitsu) still deliver gray/BW unless bit depth is set; auto-colour can force mono.
            if (pixelType == PixelType.RGB)
            {
                SafeSet(() => source.Capabilities.ICapAutomaticColorEnabled.SetValue(BoolType.False));
                SafeSet(() => source.Capabilities.ICapBitDepth.SetValue(24));
            }
            else if (pixelType == PixelType.Gray)
                SafeSet(() => source.Capabilities.ICapBitDepth.SetValue(8));
            else
                SafeSet(() => source.Capabilities.ICapBitDepth.SetValue(1));
        }

        private static void ApplyBrandCapabilities(
            DataSource source,
            Dictionary<string, object> brandCaps)
        {
            foreach (var kv in brandCaps)
            {
                try
                {
                    int intVal = Convert.ToInt32(kv.Value);
                    switch (kv.Key)
                    {
                        case "ICAP_XRESOLUTION":
                            SafeSet(() => source.Capabilities.ICapXResolution.SetValue((TWFix32)intVal)); break;
                        case "ICAP_YRESOLUTION":
                            SafeSet(() => source.Capabilities.ICapYResolution.SetValue((TWFix32)intVal)); break;
                        case "ICAP_PIXELTYPE":
                            SafeSet(() => source.Capabilities.ICapPixelType.SetValue((PixelType)intVal)); break;
                        case "CAP_DUPLEXENABLED":
                            SafeSet(() => source.Capabilities.CapDuplexEnabled.SetValue(intVal != 0 ? BoolType.True : BoolType.False)); break;
                        case "ICAP_SUPPORTEDSIZES":
                            SafeSet(() => source.Capabilities.ICapSupportedSizes.SetValue((SupportedSize)intVal)); break;
                        case "ICAP_AUTOMATICDESKEW":
                            SafeSet(() => source.Capabilities.ICapAutomaticDeskew.SetValue(intVal != 0 ? BoolType.True : BoolType.False)); break;
                        case "ICAP_AUTOMATICROTATE":
                            SafeSet(() => source.Capabilities.ICapAutomaticRotate.SetValue(intVal != 0 ? BoolType.True : BoolType.False)); break;
                        case "ICAP_BRIGHTNESS":
                            SafeSet(() => source.Capabilities.ICapBrightness.SetValue((TWFix32)intVal)); break;
                        case "ICAP_CONTRAST":
                            SafeSet(() => source.Capabilities.ICapContrast.SetValue((TWFix32)intVal)); break;
                        case "ICAP_AUTODISCARDBLANKPAGES":
                            SafeSet(() => source.Capabilities.ICapAutoDiscardBlankPages.SetValue(intVal != 0 ? BlankPage.Auto : BlankPage.Disable)); break;
                    }
                }
                catch { /* skip unsupported cap for this scanner model */ }
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private static TwainSession CreateSession()
        {
            var appId = TWIdentity.CreateFromAssembly(DataGroups.Image,
                typeof(TwainScannerService).Assembly);
            return new TwainSession(appId);
        }

        private static void SafeSet(Action action)
        {
            try { action(); } catch { }
        }

        private static void TryClose(TwainSession? session)
        {
            try { session?.Close(); } catch { }
        }

        /// <summary>
        /// Converts a native Windows DIB (Device-Independent Bitmap) handle
        /// to a managed <see cref="Bitmap"/> using Marshal for safe memory access.
        /// </summary>
        private static Bitmap? BitmapFromNativeDib(IntPtr dibHandle)
        {
            if (dibHandle == IntPtr.Zero) return null;
            try
            {
                // Read BITMAPINFOHEADER.biSize (first DWORD)
                int biSize = System.Runtime.InteropServices.Marshal.ReadInt32(dibHandle, 0);
                if (biSize < 12) return null;

                // Read width and height from BITMAPINFOHEADER
                int width  = System.Runtime.InteropServices.Marshal.ReadInt32(dibHandle, 4);
                int height = System.Runtime.InteropServices.Marshal.ReadInt32(dibHandle, 8);
                if (width <= 0 || height == 0) return null;

                // Read bits-per-pixel (offset 14 in BITMAPINFOHEADER)
                short bpp = System.Runtime.InteropServices.Marshal.ReadInt16(dibHandle, 14);
                if (bpp <= 0) bpp = 24;

                // Calculate row stride (rounded up to 4-byte boundary)
                int rowBytes = (width * bpp / 8 + 3) & ~3;
                int pixelDataSize = rowBytes * Math.Abs(height);
                int totalBmpSize  = 14 + biSize + pixelDataSize;

                var bmpBytes = new byte[totalBmpSize];

                // BITMAPFILEHEADER (14 bytes): 'BM', filesize, reserved(0), offset to pixel data
                bmpBytes[0] = (byte)'B';
                bmpBytes[1] = (byte)'M';
                Buffer.BlockCopy(BitConverter.GetBytes(totalBmpSize), 0, bmpBytes, 2, 4);
                // Offset to pixel data = 14 (file header) + biSize (info header)
                Buffer.BlockCopy(BitConverter.GetBytes(14 + biSize), 0, bmpBytes, 10, 4);

                // Copy DIB data (INFOHEADER + colour table + pixel data) after file header
                System.Runtime.InteropServices.Marshal.Copy(dibHandle, bmpBytes, 14, biSize + pixelDataSize);

                using var ms = new MemoryStream(bmpBytes);
                using var tmp = new Bitmap(ms);
                return new Bitmap(tmp); // detached copy; stream can now be disposed safely
            }
            catch
            {
                return null;
            }
        }
    }
}
