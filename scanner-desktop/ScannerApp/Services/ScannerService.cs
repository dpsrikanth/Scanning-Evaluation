using System.Drawing;
using System.Runtime.InteropServices;
using ScannerApp.Models;

namespace ScannerApp.Services
{
    public class ScannerDevice
    {
        public string DeviceId { get; set; } = "";
        public string Name { get; set; } = "";
        public string Source { get; set; } = "WIA";
        public override string ToString() => Name;
    }

    /// <summary>
    /// WIA (Windows Image Acquisition) scanner driver implementation.
    /// Universal — works with any WIA-compatible scanner without extra drivers.
    /// </summary>
    public class ScannerService : IScannerService
    {
        // WIA Device type constant (1 = Scanner)
        private const int WIA_SCANNER_DEVICE_TYPE = 1;

        // WIA Item property IDs (WIA 2.0 spec)
        private const int WIA_IPS_XRES       = 6147;
        private const int WIA_IPS_YRES       = 6148;
        private const int WIA_IPS_CUR_INTENT = 6146;
        private const int WIA_IPS_BRIGHTNESS = 6154;
        private const int WIA_IPS_CONTRAST   = 6155;
        private const int WIA_IPS_THRESHOLD  = 6159; // 0-255 cutoff for BlackWhite pixel mode

        // WIA item-level data type and depth (WIA spec §4.3)
        private const int WIA_IPA_DATATYPE = 4103; // 0=BlackWhite  1=Grayscale  2=Color
        private const int WIA_IPA_DEPTH    = 4104; // bits per channel: 1 / 8 / 24

        // WIA Document Handling flags (wiadef.h values)
        private const int WIA_DPS_DOCUMENT_HANDLING_SELECT = 3088;
        private const int WIA_DOCUMENT_FEEDER       = 0x001; // ADF feeder
        private const int WIA_DOCUMENT_FLATBED      = 0x002; // flatbed glass
        private const int WIA_DOCUMENT_DUPLEX       = 0x004; // both sides (OR with FEEDER)
        private const int WIA_DOCUMENT_FRONT_ONLY   = 0x020; // WIA 2.0: single side on item
        private const int WIA_DOCUMENT_FEEDER_DUPLEX = WIA_DOCUMENT_FEEDER | WIA_DOCUMENT_DUPLEX; // = 5

        // Scan intent bitmask values — WIA 2.0 spec §WIA_IPS_CUR_INTENT
        private const int WIA_INTENT_IMAGE_TYPE_COLOR     = 1; // 0x0001 — full colour scan
        private const int WIA_INTENT_IMAGE_TYPE_GRAYSCALE = 2; // 0x0002 — greyscale
        private const int WIA_INTENT_IMAGE_TYPE_TEXT      = 4; // 0x0004 — text / black-and-white

        // Image format GUIDs
        private const string WIA_FORMAT_BMP = "{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}";

        // ── IScannerService: enumerate ────────────────────────────────────────

        public IList<string> GetAvailableScanners()
        {
            var names = new List<string>();
            foreach (var dev in GetScannerDevices())
                names.Add(dev.Name);
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
            return await Task.Run(() =>
            {
                if (source == ScanSource.Flatbed)
                    return ScanFlatbedPages(scannerName, template, cancellationToken, progress);

                return ScanFeederPages(scannerName, template, source, cancellationToken, progress);
            }, cancellationToken);
        }

        /// <summary>
        /// Scans from ADF (simplex or duplex) in a single device session so the
        /// duplex state is preserved across Transfer() calls.
        /// </summary>
        private IList<Bitmap> ScanFeederPages(
            string scannerName, ScanTemplate template,
            ScanSource source, CancellationToken ct,
            IProgress<Bitmap>? progress = null)
        {
            var pages = new List<Bitmap>();
            object? manager = null;
            object? device  = null;

            try
            {
                var managerType = Type.GetTypeFromProgID("WIA.DeviceManager");
                if (managerType == null) return pages;

                manager = Activator.CreateInstance(managerType)!;
                device  = ConnectByName((dynamic)manager, scannerName);

                // WIA 1.0 device-level: FEEDER (1) or FEEDER|DUPLEX (5)
                int deviceHandling = source == ScanSource.FeederDuplex
                    ? WIA_DOCUMENT_FEEDER_DUPLEX  // 5
                    : WIA_DOCUMENT_FEEDER;        // 1

                SetWiaProperty(((dynamic)device).Properties,
                    WIA_DPS_DOCUMENT_HANDLING_SELECT, deviceHandling);

                dynamic item = GetFeederItem((dynamic)device);

                // WIA 2.0 item-level: DUPLEX (4) or FRONT_ONLY (0x20)
                int itemHandling = source == ScanSource.FeederDuplex
                    ? WIA_DOCUMENT_DUPLEX      // 4
                    : WIA_DOCUMENT_FRONT_ONLY; // 0x20
                SetWiaProperty(item.Properties, WIA_DPS_DOCUMENT_HANDLING_SELECT, itemHandling);
                SetWiaProperty(item.Properties, WIA_IPS_XRES, template.DPI);
                SetWiaProperty(item.Properties, WIA_IPS_YRES, template.DPI);

                int intent = ColorModeToIntent(template.ColorMode);
                SetWiaProperty(item.Properties, WIA_IPS_CUR_INTENT, intent);
                ApplyScanQuality(item.Properties, template);

                for (int i = 0; i < template.PageCount; i++)
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        dynamic imageFile = item.Transfer(WIA_FORMAT_BMP);
                        byte[] bmpBytes = (byte[])imageFile.FileData.BinaryData;
                        using var ms  = new MemoryStream(bmpBytes);
                        using var tmp = new Bitmap(ms);
                        var page = new Bitmap(tmp);
                        pages.Add(page);
                        progress?.Report(page);
                    }
                    catch (COMException comEx) when ((uint)comEx.HResult == 0x80210003)
                    {
                        break; // ADF empty
                    }
                    catch (COMException comEx) when ((uint)comEx.HResult == 0x80210006)
                    {
                        throw new InvalidOperationException("Scanner cover open or paper jam.", comEx);
                    }
                }
            }
            catch (OperationCanceledException) { throw; }
            catch (InvalidOperationException) { throw; }
            catch (COMException comEx)
            {
                throw new InvalidOperationException(
                    $"Scanner error (0x{comEx.HResult:X8}): {comEx.Message}", comEx);
            }
            finally
            {
                if (device  != null) TryReleaseCom(device);
                if (manager != null) TryReleaseCom(manager);
            }
            return pages;
        }

        private IList<Bitmap> ScanFlatbedPages(
            string scannerName, ScanTemplate template, CancellationToken ct,
            IProgress<Bitmap>? progress = null)
        {
            var pages = new List<Bitmap>();
            var dev = GetScannerDevices().FirstOrDefault(d => d.Name == scannerName)
                ?? throw new InvalidOperationException($"Scanner '{scannerName}' not found.");

            for (int i = 0; i < template.PageCount; i++)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    var bmp = ScanPage(dev.DeviceId, template.DPI,
                        template.ColorMode, template.BrightnessAdj, template.ContrastAdj,
                        ScanSource.Flatbed, template.Threshold);
                    if (bmp != null)
                    {
                        pages.Add(bmp);
                        progress?.Report(bmp);
                    }
                }
                catch (InvalidOperationException ex) when (ex.Message.Contains("empty"))
                {
                    break;
                }
            }
            return pages;
        }

        // ── Legacy helpers (still available for direct use) ──────────────────

        public List<ScannerDevice> GetScannerDevices()
        {
            var scanners = new List<ScannerDevice>();
            object? manager = null;
            object? infos   = null;

            try
            {
                var managerType = Type.GetTypeFromProgID("WIA.DeviceManager");
                if (managerType == null) return scanners;

                manager = Activator.CreateInstance(managerType)!;
                infos   = ((dynamic)manager).DeviceInfos;
                int count = (int)((dynamic)infos).Count;

                for (int i = 1; i <= count; i++)
                {
                    dynamic info = ((dynamic)infos)[i];
                    try
                    {
                        if ((int)info.Type != WIA_SCANNER_DEVICE_TYPE) continue;
                        string name     = GetWiaPropertyString(info.Properties, "Name") ?? $"Scanner #{i}";
                        string deviceId = (string)info.DeviceID;
                        scanners.Add(new ScannerDevice { DeviceId = deviceId, Name = name, Source = "WIA" });
                    }
                    catch { }
                }
            }
            catch { }
            finally
            {
                if (infos   != null) TryReleaseCom(infos);
                if (manager != null) TryReleaseCom(manager);
            }

            return scanners;
        }

        public Bitmap? ScanPage(string deviceId, int dpi, string colorMode,
            int brightnessAdj = 0, int contrastAdj = 0,
            ScanSource source = ScanSource.FeederDuplex, int threshold = 128)
        {
            object? manager = null;
            object? device  = null;

            try
            {
                var managerType = Type.GetTypeFromProgID("WIA.DeviceManager");
                if (managerType == null) return null;

                manager = Activator.CreateInstance(managerType)!;
                device  = ConnectByDeviceId((dynamic)manager, deviceId);

                // WIA 1.0 device-level handling flag
                int deviceHandling = source switch
                {
                    ScanSource.FeederDuplex  => WIA_DOCUMENT_FEEDER_DUPLEX, // 5
                    ScanSource.FeederSimplex => WIA_DOCUMENT_FEEDER,        // 1
                    _                        => WIA_DOCUMENT_FLATBED,       // 2
                };
                SetWiaProperty(((dynamic)device).Properties,
                    WIA_DPS_DOCUMENT_HANDLING_SELECT, deviceHandling);

                // Select the correct WIA item (HP MFPs: [1]=Flatbed [2]=ADF)
                dynamic item;
                if (source != ScanSource.Flatbed)
                {
                    item = GetFeederItem((dynamic)device);
                    int itemHandling = source == ScanSource.FeederDuplex
                        ? WIA_DOCUMENT_DUPLEX      // 4
                        : WIA_DOCUMENT_FRONT_ONLY; // 0x20
                    SetWiaProperty(item.Properties, WIA_DPS_DOCUMENT_HANDLING_SELECT, itemHandling);
                }
                else
                {
                    item = ((dynamic)device!).Items[1];
                }

                SetWiaProperty(item.Properties, WIA_IPS_XRES, dpi);
                SetWiaProperty(item.Properties, WIA_IPS_YRES, dpi);

                int intent = colorMode.Equals("Color", StringComparison.OrdinalIgnoreCase)
                    ? WIA_INTENT_IMAGE_TYPE_COLOR
                    : colorMode.Equals("BlackWhite", StringComparison.OrdinalIgnoreCase)
                        ? WIA_INTENT_IMAGE_TYPE_TEXT
                        : WIA_INTENT_IMAGE_TYPE_GRAYSCALE;

                SetWiaProperty(item.Properties, WIA_IPS_CUR_INTENT, intent);

                // Normalize from 0-255 ScanAll Pro scale (128=neutral) to WIA -1000..+1000
                int wiaB = NormalizeToWia(brightnessAdj);
                int wiaC = NormalizeToWia(contrastAdj);
                if (wiaB != 0) SetWiaProperty(item.Properties, WIA_IPS_BRIGHTNESS, wiaB);
                if (wiaC != 0) SetWiaProperty(item.Properties, WIA_IPS_CONTRAST,   wiaC);
                if (colorMode.Equals("BlackWhite", StringComparison.OrdinalIgnoreCase))
                    SetWiaProperty(item.Properties, WIA_IPS_THRESHOLD, threshold);

                // Explicit pixel colour depth for reliable colour mode
                switch (colorMode)
                {
                    case "Color":
                        SetWiaProperty(item.Properties, WIA_IPA_DATATYPE, 2);
                        SetWiaProperty(item.Properties, WIA_IPA_DEPTH,    24);
                        break;
                    case "BlackWhite":
                        SetWiaProperty(item.Properties, WIA_IPA_DATATYPE, 0);
                        SetWiaProperty(item.Properties, WIA_IPA_DEPTH,    1);
                        break;
                    default:
                        SetWiaProperty(item.Properties, WIA_IPA_DATATYPE, 1);
                        SetWiaProperty(item.Properties, WIA_IPA_DEPTH,    8);
                        break;
                }

                dynamic imageFile = item.Transfer(WIA_FORMAT_BMP);
                byte[] bmpBytes  = (byte[])imageFile.FileData.BinaryData;
                using var ms = new MemoryStream(bmpBytes);
                // Bitmap holds a reference to the stream; copy to a detached instance
                // so the MemoryStream can be safely disposed when this method returns.
                using var tmp = new Bitmap(ms);
                return new Bitmap(tmp);
            }
            catch (COMException comEx) when ((uint)comEx.HResult == 0x80210003)
            {
                throw new InvalidOperationException("ADF feeder is empty.", comEx);
            }
            catch (COMException comEx) when ((uint)comEx.HResult == 0x80210006)
            {
                throw new InvalidOperationException("Scanner cover open or paper jam.", comEx);
            }
            catch (COMException comEx)
            {
                throw new InvalidOperationException($"Scanner error (0x{comEx.HResult:X8}): {comEx.Message}", comEx);
            }
            finally
            {
                if (device  != null) TryReleaseCom(device);
                if (manager != null) TryReleaseCom(manager);
            }
        }

        // ── Private helpers ──────────────────────────────────────────────────

        private static dynamic ConnectByDeviceId(dynamic manager, string deviceId)
        {
            int count = (int)manager.DeviceInfos.Count;
            for (int i = 1; i <= count; i++)
            {
                dynamic info = manager.DeviceInfos[i];
                try
                {
                    if ((string)info.DeviceID == deviceId)
                        return info.Connect();
                }
                catch { }
            }
            throw new InvalidOperationException($"Scanner device '{deviceId}' not found.");
        }

        /// <summary>Iterate DeviceInfos by integer index, match by name, and Connect().</summary>
        private static dynamic ConnectByName(dynamic manager, string scannerName)
        {
            int count = (int)manager.DeviceInfos.Count;
            for (int i = 1; i <= count; i++)
            {
                dynamic info = manager.DeviceInfos[i];
                try
                {
                    if ((int)info.Type != WIA_SCANNER_DEVICE_TYPE) continue;
                    string name = GetWiaPropertyString(info.Properties, "Name") ?? "";
                    if (name.Equals(scannerName, StringComparison.OrdinalIgnoreCase))
                        return info.Connect();
                }
                catch { }
            }
            throw new InvalidOperationException($"Scanner '{scannerName}' not found.");
        }

        /// <summary>Returns the ADF/feeder item. HP MFPs: [1]=Flatbed [2]=ADF.</summary>
        private static dynamic GetFeederItem(dynamic device)
        {
            try
            {
                int count = (int)device.Items.Count;
                return count >= 2 ? device.Items[2] : device.Items[1];
            }
            catch { return device.Items[1]; }
        }

        private static int ColorModeToIntent(string colorMode) => colorMode switch
        {
            "Color"      => WIA_INTENT_IMAGE_TYPE_COLOR,
            "BlackWhite" => WIA_INTENT_IMAGE_TYPE_TEXT,
            _            => WIA_INTENT_IMAGE_TYPE_GRAYSCALE,
        };

        /// <summary>
        /// Converts the ScanAll Pro 0-255 brightness/contrast scale (128 = neutral) to the
        /// WIA property range -1000…+1000 (0 = neutral).
        /// </summary>
        private static int NormalizeToWia(int scanAllProValue) =>
            Math.Clamp((scanAllProValue - 128) * 8, -1000, 1000);

        /// <summary>
        /// Applies brightness, contrast, threshold, and pixel colour-depth properties.
        /// Skips each property when the value is already at the neutral/default point
        /// so the scanner's own hardware default is not overridden unnecessarily.
        /// </summary>
        private static void ApplyScanQuality(dynamic properties, ScanTemplate template)
        {
            // Brightness/contrast — only override when different from neutral (128)
            int wiaB = NormalizeToWia(template.BrightnessAdj);
            int wiaC = NormalizeToWia(template.ContrastAdj);
            if (wiaB != 0) SetWiaProperty(properties, WIA_IPS_BRIGHTNESS, wiaB);
            if (wiaC != 0) SetWiaProperty(properties, WIA_IPS_CONTRAST,   wiaC);

            // Threshold — only relevant for BlackWhite mode
            if (template.ColorMode.Equals("BlackWhite", StringComparison.OrdinalIgnoreCase))
                SetWiaProperty(properties, WIA_IPS_THRESHOLD, template.Threshold);

            // Explicit pixel type + bit-depth for reliable colour mode selection
            switch (template.ColorMode)
            {
                case "Color":
                    SetWiaProperty(properties, WIA_IPA_DATATYPE, 2); // IT_COLOR
                    SetWiaProperty(properties, WIA_IPA_DEPTH,    24);
                    break;
                case "BlackWhite":
                    SetWiaProperty(properties, WIA_IPA_DATATYPE, 0); // IT_BLACKANDWHITE
                    SetWiaProperty(properties, WIA_IPA_DEPTH,    1);
                    break;
                default: // Grayscale
                    SetWiaProperty(properties, WIA_IPA_DATATYPE, 1); // IT_GRAY
                    SetWiaProperty(properties, WIA_IPA_DEPTH,    8);
                    break;
            }
        }

        private static void SetWiaProperty(dynamic properties, int propId, int value)
        {
            try
            {
                int count = (int)properties.Count;
                for (int i = 1; i <= count; i++)
                {
                    dynamic p = properties[i];
                    if ((int)p.PropertyID == propId) { p.Value = value; return; }
                }
            }
            catch { }
        }

        private static string? GetWiaPropertyString(dynamic properties, string name)
        {
            try
            {
                int count = (int)properties.Count;
                for (int i = 1; i <= count; i++)
                {
                    dynamic p = properties[i];
                    if ((string)p.Name == name) return p.Value?.ToString();
                }
            }
            catch { }
            return null;
        }

        private static void TryReleaseCom(object obj)
        {
            try { Marshal.FinalReleaseComObject(obj); } catch { }
        }
    }
}
