using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using IronBarCode;
using Rectangle = System.Drawing.Rectangle;
using Newtonsoft.Json;
using ScannerApp.Models;
using ScannerApp.Utils;

namespace ScannerApp.Services
{
    /// <summary>
    /// Barcode reading service backed by IronBarcode (IronSoftware).
    /// Options objects are created per-call to avoid any shared-state issues across parallel threads.
    /// </summary>
    public class BarcodeService
    {
        private static readonly ImageCodecInfo JpegEncoder =
            ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
        private static readonly double[] BottomFractions = { 0.10, 0.15, 0.20, 0.28, 0.40, 0.50 };
        private static readonly double[] BottomFractionsUpsample = { 0.15, 0.25, 0.40 };

        // ── Option factories (new instance per call — avoids any IronBarcode internal state issues) ──

        private static BarcodeReaderOptions MakeOptsFast() => new()
        {
            Speed                  = ReadingSpeed.Balanced,
            ExpectBarcodeTypes     = BarcodeEncoding.Code128 | BarcodeEncoding.Code39
                                   | BarcodeEncoding.ITF | BarcodeEncoding.EAN13 | BarcodeEncoding.EAN8,
            ExpectMultipleBarcodes = false,
        };

        private static BarcodeReaderOptions MakeOptsTight() => new()
        {
            Speed                  = ReadingSpeed.Detailed,
            ExpectBarcodeTypes     = BarcodeEncoding.Code128 | BarcodeEncoding.Code39
                                   | BarcodeEncoding.QRCode  | BarcodeEncoding.EAN13
                                   | BarcodeEncoding.EAN8,
            ExpectMultipleBarcodes = true,
        };

        private static BarcodeReaderOptions MakeOptsRelaxed() => new()
        {
            Speed                  = ReadingSpeed.ExtremeDetail,
            ExpectBarcodeTypes     = BarcodeEncoding.AllOneDimensional | BarcodeEncoding.QRCode
                                   | BarcodeEncoding.DataMatrix | BarcodeEncoding.PDF417
                                   | BarcodeEncoding.Aztec,
            ExpectMultipleBarcodes = true,
        };

        private static BarcodeReaderOptions MakeOptsQrOnly() => new()
        {
            Speed                  = ReadingSpeed.Balanced,
            ExpectBarcodeTypes     = BarcodeEncoding.QRCode,
            ExpectMultipleBarcodes = true,
        };

        // ── Core decode helper ────────────────────────────────────────────────

        /// <summary>
        /// Encodes the bitmap as JPEG (faster than PNG) and passes to IronBarcode.
        /// Creates a new options instance each call to avoid shared-state thread issues.
        /// </summary>
        private static BarcodeResults? IronRead(Bitmap bmp, BarcodeReaderOptions opts)
        {
            try
            {
                using var ms = new System.IO.MemoryStream();
                // JPEG is smaller and faster to encode than PNG; cache encoder lookup for hot path.
                using var encParams = new System.Drawing.Imaging.EncoderParameters(1);
                encParams.Param[0] = new System.Drawing.Imaging.EncoderParameter(
                    System.Drawing.Imaging.Encoder.Quality, 80L);
                bmp.Save(ms, JpegEncoder, encParams);
                ms.Position = 0;
                return BarcodeReader.Read(ms, opts);
            }
            catch
            {
                return null;
            }
        }

        private static string? FirstValue(BarcodeResults? results)
        {
            if (results == null) return null;
            foreach (var r in results)
                if (!string.IsNullOrEmpty(r.Value)) return r.Value;
            return null;
        }

        private static string? FirstPageNumber(BarcodeResults? results)
        {
            if (results == null) return null;
            foreach (var r in results)
            {
                if (string.IsNullOrEmpty(r.Value)) continue;
                if (IsLikelyPageNumberPayload(r.Value)) return r.Value.Trim();
            }
            return null;
        }

        // ── Public API ────────────────────────────────────────────────────────

        /// <summary>Reads linear barcode and QR code from the full page.</summary>
        public (string? LinearText, string? QrText) ReadLinearAndQrParallel(Bitmap image)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return (null, null);

            string? lin = null, qr = null;
            try
            {
                var results = IronRead(image, MakeOptsTight());
                if (results != null)
                {
                    foreach (var r in results)
                    {
                        if (string.IsNullOrEmpty(r.Value)) continue;
                        if (r.BarcodeType == BarcodeEncoding.QRCode) qr ??= r.Value;
                        else                                          lin ??= r.Value;
                    }
                }
                if (lin == null && qr == null)
                {
                    // Second pass with relaxed settings
                    results = IronRead(image, MakeOptsRelaxed());
                    if (results != null)
                    {
                        foreach (var r in results)
                        {
                            if (string.IsNullOrEmpty(r.Value)) continue;
                            if (r.BarcodeType == BarcodeEncoding.QRCode) qr ??= r.Value;
                            else                                          lin ??= r.Value;
                        }
                    }
                }
            }
            catch { }
            return (lin, qr);
        }

        /// <summary>Reads the first barcode found on an image.</summary>
        public string? ReadBarcode(Bitmap image)
        {
            if (image == null || image.Width < 16 || image.Height < 16) return null;
            return FirstValue(IronRead(image, MakeOptsTight()))
                ?? FirstValue(IronRead(image, MakeOptsRelaxed()));
        }

        public string? ReadBarcodeFromFile(string imagePath)
        {
            using var bmp = new Bitmap(imagePath);
            return ReadBarcode(bmp);
        }

        /// <summary>Reads barcode from the bottom N% of the image.</summary>
        public string? ReadBarcodeFromBottom(Bitmap image, double bottomHeightFraction = 0.22)
        {
            if (image == null || image.Width < 16 || image.Height < 16) return null;
            return TryDecodeBottomStrip(image, bottomHeightFraction, false, MakeOptsTight())
                ?? TryDecodeBottomStrip(image, bottomHeightFraction, false, MakeOptsRelaxed());
        }

        /// <summary>Reads barcode from a specific rectangle on the image.</summary>
        public string? ReadBarcodeFromRectangle(Bitmap image, Rectangle rect)
        {
            if (image == null || image.Width < 8 || image.Height < 8) return null;
            var r = Rectangle.Intersect(rect, new Rectangle(0, 0, image.Width, image.Height));
            if (r.Width < 4 || r.Height < 4) return null;
            try
            {
                using var crop = image.Clone(r, image.PixelFormat);
                return FirstValue(IronRead(crop, MakeOptsTight()))
                    ?? FirstValue(IronRead(crop, MakeOptsRelaxed()));
            }
            catch { return null; }
        }

        /// <summary>Reads the page-serial barcode using zone or footer heuristics.</summary>
        public string? ReadPageSerialOrFooter(Bitmap image, int pageNumber1Based, int barcodeStartPage1Based, string? zonesJson)
        {
            var (result, _) = ReadPageSerialOrFooterWithDiag(image, pageNumber1Based, barcodeStartPage1Based, zonesJson);
            return result;
        }

        /// <summary>
        /// Reads the page-serial barcode with diagnostic info for dev tooltips.
        /// Uses zone (if configured) then bottom-strip heuristics.
        /// Never falls through to full-page decode (avoids picking up the document barcode).
        /// </summary>
        public (string? Result, string Diag) ReadPageSerialOrFooterWithDiag(
            Bitmap image, int pageNumber1Based, int barcodeStartPage1Based, string? zonesJson)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return (null, "image null or too small");

            var diag = new System.Text.StringBuilder();
            diag.Append($"img {image.Width}x{image.Height}");

            // 1. Zone-based decode (fast path — exact rectangle from template)
            var zone = PageSerialZoneHelper.FindPageSerialZone(zonesJson);
            if (zone != null && PageSerialZoneHelper.ShouldApplyPageSerialZone(zone, pageNumber1Based, barcodeStartPage1Based))
            {
                var rect = ZoneToRectangle(image, zone);
                diag.Append($" | key={PageSerialZoneHelper.PrimaryZoneKey}");
                diag.Append($" | zone% x={zone.XPct:0.##} y={zone.YPct:0.##} w={zone.WPct:0.##} h={zone.HPct:0.##}");
                diag.Append($" | zonePx x={rect.X} y={rect.Y} w={rect.Width} h={rect.Height}");

                foreach (bool up in new[] { false, true })
                {
                    try
                    {
                        var zr = Rectangle.Intersect(rect, new Rectangle(0, 0, image.Width, image.Height));
                        if (zr.Width < 4 || zr.Height < 4) continue;
                        using var crop = image.Clone(zr, image.PixelFormat);
                        Bitmap? upscaled = up ? UpsampleNearest(crop, 2) : null;
                        Bitmap work = upscaled ?? crop;
                        try
                        {
                            var t = TryReadSerial(work);
                            if (t != null)
                            {
                                diag.Append($" => zone{(up ? "-2x" : "")} \"{t}\"");
                                return (t, diag.ToString());
                            }
                        }
                        finally { upscaled?.Dispose(); }
                    }
                    catch { }
                }
                diag.Append(" => null");
            }
            else
            {
                diag.Append(zone == null ? " | no zone" : " | zone skip");
            }

            // 2. Bottom strips — multiple fractions
            foreach (var frac in BottomFractions)
            {
                var (t, raw) = TryDecodeBottomStripWithRaw(image, frac, false);
                var rectTxt = BottomStripRectText(image, frac);
                diag.Append($" | bot-{frac:0.##}({rectTxt})={raw ?? "null"}");
                if (t != null) return (t, diag.ToString());
            }

            // 3. Same fractions with 2x upsample (low-DPI rescue)
            foreach (var frac in BottomFractionsUpsample)
            {
                var (t, raw) = TryDecodeBottomStripWithRaw(image, frac, true);
                var rectTxt = BottomStripRectText(image, frac);
                diag.Append($" | bot-{frac:0.##}-2x({rectTxt})={raw ?? "null"}");
                if (t != null) return (t, diag.ToString());
            }

            return (null, diag.ToString());
        }

        /// <summary>Legacy helper used by MainForm barcode-for-page-number fallback.</summary>
        public string? ReadBarcodeForPageNumber(Bitmap image)
        {
            var (result, _) = ReadPageSerialOrFooterWithDiag(image, 1, 1, null);
            return result;
        }

        /// <summary>Parses template JSON and reads each named zone from the appropriate scanned page.</summary>
        public Dictionary<string, string> DecodeTemplateZones(IList<Bitmap> pages, string? zonesJson)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (pages == null || pages.Count == 0 || string.IsNullOrWhiteSpace(zonesJson))
                return map;

            List<TemplateBarcodeZone>? zones;
            try { zones = JsonConvert.DeserializeObject<List<TemplateBarcodeZone>>(zonesJson); }
            catch { return map; }
            if (zones == null) return map;

            foreach (var z in zones)
            {
                if (string.IsNullOrWhiteSpace(z.ZoneName)) continue;
                if (PageSerialZoneHelper.IsReservedPageSerialName(z.ZoneName)) continue;
                int pageIdx = z.PageScope.Equals("fromPage", StringComparison.OrdinalIgnoreCase)
                    ? Math.Max(0, z.PageNumber - 1) : 0;
                if (pageIdx >= pages.Count) continue;
                var bmp  = pages[pageIdx];
                var rect = ZoneToRectangle(bmp, z);
                var text = ReadBarcodeFromRectangle(bmp, rect);
                if (!string.IsNullOrWhiteSpace(text))
                    map[z.ZoneName.Trim()] = text.Trim();
            }
            return map;
        }

        public List<string> ReadAllBarcodes(Bitmap image)
        {
            if (image == null || image.Width < 16) return new List<string>();
            var results = IronRead(image, MakeOptsTight());
            if (results == null) return new List<string>();
            return results.Select(r => r.Value).Where(v => !string.IsNullOrEmpty(v)).ToList()!;
        }

        public List<(string Format, string Text)> ReadAllBarcodesDetailed(Bitmap image)
        {
            if (image == null || image.Width < 16) return new List<(string, string)>();
            var results = IronRead(image, MakeOptsRelaxed());
            if (results == null) return new List<(string, string)>();
            return results
                .Where(r => !string.IsNullOrEmpty(r.Value))
                .Select(r => (r.BarcodeType.ToString(), r.Value!))
                .ToList();
        }

        // ── Private helpers ────────────────────────────────────────────────────

        /// <summary>
        /// Try to read a page-serial barcode from a bitmap.
        /// Uses Balanced then Detailed then ExtremeDetail — each with a fresh options instance.
        /// Returns the first IsLikelyPageNumberPayload result.
        /// </summary>
        private static string? TryReadSerial(Bitmap work)
        {
            var r = FirstPageNumber(IronRead(work, MakeOptsFast()));
            if (r != null) return r;
            r = FirstPageNumber(IronRead(work, MakeOptsTight()));
            if (r != null) return r;
            return FirstPageNumber(IronRead(work, MakeOptsRelaxed()));
        }

        /// <summary>
        /// Decode a bottom strip and return (filtered result, raw first value for diagnostics).
        /// </summary>
        private static (string? Result, string? RawFirst) TryDecodeBottomStripWithRaw(Bitmap image, double frac, bool upsample)
        {
            try
            {
                int stripH = Math.Max(32, (int)(image.Height * frac));
                int y0 = Math.Max(0, image.Height - stripH);
                using var strip = image.Clone(new Rectangle(0, y0, image.Width, stripH), image.PixelFormat);
                Bitmap? upscaled = upsample ? UpsampleNearest(strip, 2) : null;
                Bitmap work = upscaled ?? strip;
                try
                {
                    string? raw = null;
                    foreach (var opts in new[] { MakeOptsFast(), MakeOptsTight(), MakeOptsRelaxed() })
                    {
                        var results = IronRead(work, opts);
                        if (results == null) continue;
                        foreach (var r in results)
                        {
                            if (string.IsNullOrEmpty(r.Value)) continue;
                            raw ??= r.Value;
                            if (IsLikelyPageNumberPayload(r.Value)) return (r.Value.Trim(), r.Value);
                        }
                    }
                    return (null, raw);
                }
                finally { upscaled?.Dispose(); }
            }
            catch { return (null, null); }
        }

        private static string? TryDecodeBottomStrip(Bitmap image, double frac, bool upsample, BarcodeReaderOptions opts)
        {
            try
            {
                int stripH = Math.Max(32, (int)(image.Height * frac));
                int y0 = Math.Max(0, image.Height - stripH);
                using var strip = image.Clone(new Rectangle(0, y0, image.Width, stripH), image.PixelFormat);
                Bitmap? upscaled = upsample ? UpsampleNearest(strip, 2) : null;
                Bitmap work = upscaled ?? strip;
                try { return FirstValue(IronRead(work, opts)); }
                finally { upscaled?.Dispose(); }
            }
            catch { return null; }
        }

        private static string BottomStripRectText(Bitmap image, double frac)
        {
            int stripH = Math.Max(32, (int)(image.Height * frac));
            int y0 = Math.Max(0, image.Height - stripH);
            return $"x=0 y={y0} w={image.Width} h={stripH}";
        }

        private static Rectangle ZoneToRectangle(Bitmap bmp, TemplateBarcodeZone z)
        {
            int px = (int)Math.Round(bmp.Width  * z.XPct / 100.0);
            int py = (int)Math.Round(bmp.Height * z.YPct / 100.0);
            int pw = Math.Max(8, (int)Math.Round(bmp.Width  * z.WPct / 100.0));
            int ph = Math.Max(8, (int)Math.Round(bmp.Height * z.HPct / 100.0));
            return new Rectangle(px, py, pw, ph);
        }

        private static Bitmap UpsampleNearest(Bitmap src, int scale)
        {
            int nw = Math.Min(src.Width * scale, 8000);
            int nh = Math.Min(src.Height * scale, 8000);
            var dst = new Bitmap(nw, nh, PixelFormat.Format24bppRgb);
            using var g = Graphics.FromImage(dst);
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.PixelOffsetMode   = PixelOffsetMode.Half;
            g.DrawImage(src, 0, 0, nw, nh);
            return dst;
        }

        private static bool IsLikelyPageNumberPayload(string text)
        {
            var t = text.Trim();
            if (int.TryParse(t, out int n) && n > 0 && n < 100000) return true;
            var parts = t.Split('_', StringSplitOptions.RemoveEmptyEntries);
            return parts.Length > 0 && int.TryParse(parts[^1].Trim(), out int m) && m > 0;
        }
    }
}
