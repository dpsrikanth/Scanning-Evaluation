using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json;
using ZXing;
using ZXing.Common;
using ZXing.Windows.Compatibility;
using ScannerApp.Models;
using ScannerApp.Utils;

namespace ScannerApp.Services
{
    public class BarcodeService
    {
        /// <summary>
        /// ZXing cost scales with pixel count. Full ADF scans (e.g. 2550×4200 ≈ 10.7 MP) make
        /// dozens of decode passes feel like a freeze. Barcodes decode reliably from ~1–2 MP.
        /// </summary>
        private const int MaxBarcodeDecodeWidth = 1280;
        private const int MaxBarcodeDecodeHeight = 2048;

        private readonly BarcodeReader _reader;
        /// <summary>Second pass: many scans fail the short format list (e.g. ITF, PDF417, DataMatrix page stamps).</summary>
        private readonly BarcodeReader _readerRelaxed;
        /// <summary>Same as <see cref="_reader"/> but no QR — used with <see cref="_readerQrOnly"/> for parallel decode.</summary>
        private readonly BarcodeReader _readerLinearTight;
        /// <summary>Relaxed formats excluding QR only.</summary>
        private readonly BarcodeReader _readerLinearRelaxed;
        private readonly BarcodeReader _readerQrOnly;

        public BarcodeService()
        {
            _reader = new BarcodeReader
            {
                AutoRotate = true,
                Options = new DecodingOptions
                {
                    TryHarder = true,
                    PossibleFormats = new List<BarcodeFormat>
                    {
                        BarcodeFormat.CODE_128,
                        BarcodeFormat.QR_CODE,
                        BarcodeFormat.CODE_39,
                        BarcodeFormat.EAN_13,
                    },
                    TryInverted = true,
                }
            };

            _readerRelaxed = new BarcodeReader
            {
                AutoRotate = true,
                Options = new DecodingOptions
                {
                    TryHarder = true,
                    TryInverted = true,
                    PossibleFormats = new List<BarcodeFormat>
                    {
                        BarcodeFormat.CODE_128,
                        BarcodeFormat.CODE_39,
                        BarcodeFormat.CODE_93,
                        BarcodeFormat.CODABAR,
                        BarcodeFormat.EAN_8,
                        BarcodeFormat.EAN_13,
                        BarcodeFormat.ITF,
                        BarcodeFormat.UPC_A,
                        BarcodeFormat.UPC_E,
                        BarcodeFormat.QR_CODE,
                        BarcodeFormat.DATA_MATRIX,
                        BarcodeFormat.PDF_417,
                        BarcodeFormat.AZTEC,
                        BarcodeFormat.RSS_14,
                        BarcodeFormat.RSS_EXPANDED,
                    },
                }
            };

            _readerLinearTight = new BarcodeReader
            {
                AutoRotate = true,
                Options = new DecodingOptions
                {
                    TryHarder = true,
                    TryInverted = true,
                    PossibleFormats = _reader.Options.PossibleFormats.Where(f => f != BarcodeFormat.QR_CODE).ToList(),
                },
            };

            _readerLinearRelaxed = new BarcodeReader
            {
                AutoRotate = true,
                Options = new DecodingOptions
                {
                    TryHarder = true,
                    TryInverted = true,
                    PossibleFormats = _readerRelaxed.Options.PossibleFormats.Where(f => f != BarcodeFormat.QR_CODE).ToList(),
                },
            };

            _readerQrOnly = new BarcodeReader
            {
                AutoRotate = true,
                Options = new DecodingOptions
                {
                    TryHarder = true,
                    TryInverted = true,
                    PossibleFormats = new List<BarcodeFormat> { BarcodeFormat.QR_CODE },
                },
            };
        }

        /// <summary>
        /// Full-page decode: linear/stacked symbologies vs QR in parallel (separate ZXing passes on cloned bitmaps).
        /// </summary>
        public (string? LinearText, string? QrText) ReadLinearAndQrParallel(Bitmap image)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return (null, null);

            Bitmap? work = null;
            Bitmap? c1 = null;
            Bitmap? c2 = null;
            try
            {
                work = NeedsDownscaleForDecode(image) ? DownscaleForBarcodeDecode(image) : (Bitmap)image.Clone();
                c1 = (Bitmap)work.Clone();
                c2 = (Bitmap)work.Clone();
                string? lin = null;
                string? qr = null;
                System.Threading.Tasks.Parallel.Invoke(
                    () =>
                    {
                        try
                        {
                            lin = TryDecodePreferPageNumberWithReader(_readerLinearTight, c1)
                                  ?? TryDecodePreferPageNumberWithReader(_readerLinearRelaxed, c1);
                        }
                        catch
                        {
                            // ignore
                        }
                    },
                    () =>
                    {
                        try
                        {
                            qr = DecodeQrFullPage(c2);
                        }
                        catch
                        {
                            // ignore
                        }
                    });
                return (lin, qr);
            }
            finally
            {
                c1?.Dispose();
                c2?.Dispose();
                work?.Dispose();
            }
        }

        private string? DecodeQrFullPage(Bitmap bmp)
        {
            try
            {
                var multi = _readerQrOnly.DecodeMultiple(bmp);
                if (multi != null)
                {
                    foreach (var r in multi)
                    {
                        if (r != null && r.BarcodeFormat == BarcodeFormat.QR_CODE && !string.IsNullOrWhiteSpace(r.Text))
                            return r.Text;
                    }
                }

                var one = _readerQrOnly.Decode(bmp);
                if (one != null && one.BarcodeFormat == BarcodeFormat.QR_CODE && !string.IsNullOrWhiteSpace(one.Text))
                    return one.Text;
            }
            catch
            {
                // ignore
            }

            return null;
        }

        public string? ReadBarcode(Bitmap image)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return null;

            try
            {
                using var z = new ZxingBitmapHandle(image);
                var work = z.Bitmap;
                if (!NeedsDownscaleForDecode(work))
                    return _reader.Decode(work)?.Text;

                using var scaled = DownscaleForBarcodeDecode(work);
                return _reader.Decode(scaled)?.Text;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Decodes the page-order barcode. Input is downscaled internally so large scans (e.g. 2550×4200)
        /// do not run dozens of full-resolution ZXing passes (which freezes the UI).
        /// </summary>
        /// <param name="bottomHeightFraction">First strip tried (legacy default 0.22); more sizes are tried automatically.</param>
        public string? ReadBarcodeFromBottom(Bitmap image, double bottomHeightFraction = 0.22)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return null;

            if (!NeedsDownscaleForDecode(image))
                return ReadBarcodeFromBottomCore(image, bottomHeightFraction);

            using var scaled = DownscaleForBarcodeDecode(image);
            return ReadBarcodeFromBottomCore(scaled, bottomHeightFraction);
        }

        private static bool NeedsDownscaleForDecode(Bitmap image) =>
            image.Width > MaxBarcodeDecodeWidth || image.Height > MaxBarcodeDecodeHeight;

        /// <summary>High-quality downscale for 1D/2D decode only; keeps barcodes readable.</summary>
        private static Bitmap DownscaleForBarcodeDecode(Bitmap src)
        {
            double scale = Math.Min(
                (double)MaxBarcodeDecodeWidth / src.Width,
                (double)MaxBarcodeDecodeHeight / src.Height);
            int nw = Math.Max(16, (int)(src.Width * scale));
            int nh = Math.Max(16, (int)(src.Height * scale));
            var dst = new Bitmap(nw, nh, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                g.CompositingQuality = CompositingQuality.HighQuality;
                g.DrawImage(src, 0, 0, nw, nh);
            }

            return dst;
        }

        /// <summary>
        /// ZXing's Windows bitmap bridge often throws <see cref="NullReferenceException"/> on indexed
        /// or exotic <see cref="PixelFormat"/>s. Normalize to 24bpp RGB before decode.
        /// </summary>
        private readonly struct ZxingBitmapHandle : IDisposable
        {
            private readonly Bitmap? _owned;
            public Bitmap Bitmap { get; }

            public ZxingBitmapHandle(Bitmap source)
            {
                if (NeedsPixelFormatNormalizeForZxing(source))
                {
                    var dst = new Bitmap(source.Width, source.Height, PixelFormat.Format24bppRgb);
                    using (var g = Graphics.FromImage(dst))
                    {
                        g.DrawImage(source, 0, 0);
                    }

                    _owned = dst;
                    Bitmap = dst;
                }
                else
                {
                    _owned = null;
                    Bitmap = source;
                }
            }

            public void Dispose() => _owned?.Dispose();
        }

        private static bool NeedsPixelFormatNormalizeForZxing(Bitmap bmp) =>
            bmp.PixelFormat is not PixelFormat.Format24bppRgb
                and not PixelFormat.Format32bppArgb
                and not PixelFormat.Format32bppRgb;

        /// <summary>
        /// Core search on a bitmap already sized for decode (caller may have downscaled).
        /// Fewer passes than historical full-res: sliding/rotation are the slow path.
        /// </summary>
        private string? ReadBarcodeFromBottomCore(Bitmap image, double bottomHeightFraction)
        {
            var fractions = new HashSet<double>
            {
                Math.Clamp(bottomHeightFraction, 0.06, 0.88),
                0.12, 0.18, 0.25, 0.32, 0.42, 0.52, 0.65, 0.78,
            };

            foreach (double f in fractions.OrderBy(x => x))
            {
                var t = TryBottomFractionStrip(image, f, upsample: false);
                if (!string.IsNullOrWhiteSpace(t)) return t;
            }

            foreach (double f in new[] { 0.52, 0.65, 0.78, 0.42, 0.32 })
            {
                var t = TryBottomFractionStrip(image, f, upsample: true);
                if (!string.IsNullOrWhiteSpace(t)) return t;
            }

            var slide = TrySlidingFooterStrips(image);
            if (!string.IsNullOrWhiteSpace(slide)) return slide;

            var anchored = TryMarginSkippedFooterBand(image);
            if (!string.IsNullOrWhiteSpace(anchored)) return anchored;

            var full = ReadBarcodePageOrderAnywhere(image);
            if (!string.IsNullOrWhiteSpace(full)) return full;

            foreach (float deg in new[] { -5f, 5f, -3f, 3f })
            {
                var t = TryDecodePageOrderRotated(image, deg);
                if (!string.IsNullOrWhiteSpace(t)) return t;
            }

            return TryDecodePreferPageNumber(image);
        }

        private string? TryBottomFractionStrip(Bitmap image, double fractionFromBottom, bool upsample)
        {
            try
            {
                int h = image.Height, w = image.Width;
                double f = Math.Clamp(fractionFromBottom, 0.06, 0.88);
                int stripH = Math.Max(32, (int)(h * f));
                int y0 = Math.Max(0, h - stripH);
                using var strip = image.Clone(new Rectangle(0, y0, w, h - y0), image.PixelFormat);
                if (upsample)
                {
                    using var big = UpsampleNearest(strip, 2);
                    return TryDecodePreferPageNumber(big);
                }

                return TryDecodePreferPageNumber(strip);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>Fixed-height windows stepped upward from the bitmap bottom (footer above long white tail).</summary>
        private string? TrySlidingFooterStrips(Bitmap image)
        {
            int h = image.Height, w = image.Width;
            int stripH = Math.Clamp(h / 6, 90, 420);
            stripH = Math.Min(stripH, h);
            int step = Math.Clamp(stripH / 3, 28, 90);
            int yStart = Math.Max(0, h - stripH);
            for (int y0 = yStart, iter = 0; y0 >= 0 && iter < 28; y0 -= step, iter++)
            {
                if (y0 < 0) break;
                int useH = Math.Min(stripH, h - y0);
                if (useH < 40) break;
                try
                {
                    using var strip = image.Clone(new Rectangle(0, y0, w, useH), image.PixelFormat);
                    var t = TryDecodePreferPageNumber(strip);
                    if (!string.IsNullOrWhiteSpace(t)) return t;
                    using var big = UpsampleNearest(strip, 2);
                    t = TryDecodePreferPageNumber(big);
                    if (!string.IsNullOrWhiteSpace(t)) return t;
                }
                catch
                {
                    // continue
                }
            }

            return null;
        }

        /// <summary>Skip very dark bottom band (bed) and very white rows, then decode a band above that.</summary>
        private string? TryMarginSkippedFooterBand(Bitmap image)
        {
            int h = image.Height, w = image.Width;
            if (h < 64 || w < 24)
                return null;
            int y = h - 1;
            const int minY = 8;
            int bedFloor = Math.Max(minY, h - Math.Min(160, Math.Max(48, h / 18)));

            while (y > bedFloor && RowIsLikelyScannerBed(image, y, w))
                y -= 2;
            while (y > minY && RowIsMostlyWhitePaper(image, y, w))
                y -= 2;

            int bottom = y;
            // Avoid Math.Clamp(min,max) where min > max on short pages (was throwing).
            int bandH = Math.Min(h, Math.Max(32, Math.Min(520, Math.Max(160, h / 5))));
            int yTop = Math.Max(0, bottom - bandH + 1);
            int height = bottom - yTop + 1;
            if (height < 48) return null;
            try
            {
                using var band = image.Clone(new Rectangle(0, yTop, w, height), image.PixelFormat);
                var t = TryDecodePreferPageNumber(band);
                if (!string.IsNullOrWhiteSpace(t)) return t;
                using var big = UpsampleNearest(band, 2);
                return TryDecodePreferPageNumber(big);
            }
            catch
            {
                return null;
            }
        }

        private static bool RowIsLikelyScannerBed(Bitmap bmp, int y, int w)
        {
            int samples = 0, dark = 0, sum = 0;
            int step = Math.Max(1, w / 120);
            for (int x = 0; x < w; x += step)
            {
                var c = bmp.GetPixel(x, y);
                int lum = (c.R + c.G + c.B) / 3;
                sum += lum;
                samples++;
                if (lum < 200) dark++;
            }

            if (samples == 0) return false;
            int mean = sum / samples;
            return mean < 228 || dark * 5 > samples;
        }

        private static bool RowIsMostlyWhitePaper(Bitmap bmp, int y, int w)
        {
            int samples = 0, bright = 0;
            int step = Math.Max(1, w / 150);
            for (int x = 0; x < w; x += step)
            {
                var c = bmp.GetPixel(x, y);
                if (c.R >= 248 && c.G >= 248 && c.B >= 248) bright++;
                samples++;
            }

            return samples > 0 && bright * 100 / samples >= 88;
        }

        private string? TryDecodePageOrderRotated(Bitmap image, float degrees)
        {
            try
            {
                using var rotated = RotateBitmapWhiteBackground(image, degrees);
                return ReadBarcodePageOrderAnywhere(rotated);
            }
            catch
            {
                return null;
            }
        }

        private static Bitmap RotateBitmapWhiteBackground(Bitmap src, float angleDeg)
        {
            double rad = angleDeg * Math.PI / 180.0;
            double cos = Math.Abs(Math.Cos(rad));
            double sin = Math.Abs(Math.Sin(rad));
            int newW = (int)Math.Ceiling(src.Width * cos + src.Height * sin);
            int newH = (int)Math.Ceiling(src.Width * sin + src.Height * cos);
            newW = Math.Max(newW, 1);
            newH = Math.Max(newH, 1);

            var dst = new Bitmap(newW, newH, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(dst))
            {
                g.Clear(Color.White);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.TranslateTransform(newW / 2f, newH / 2f);
                g.RotateTransform(angleDeg);
                g.TranslateTransform(-src.Width / 2f, -src.Height / 2f);
                g.DrawImage(src, 0, 0);
            }

            return dst;
        }

        private static Bitmap UpsampleNearest(Bitmap src, int scale)
        {
            int nw = Math.Min(src.Width * scale, 8000);
            int nh = Math.Min(src.Height * scale, 8000);
            var dst = new Bitmap(nw, nh, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                g.DrawImage(src, 0, 0, nw, nh);
            }

            return dst;
        }

        private string? TryDecodePreferPageNumber(Bitmap bmp)
        {
            if (bmp == null || bmp.Width < 8 || bmp.Height < 8) return null;
            var a = TryDecodePreferPageNumberWithReader(_reader, bmp);
            if (!string.IsNullOrWhiteSpace(a)) return a;
            return TryDecodePreferPageNumberWithReader(_readerRelaxed, bmp);
        }

        private static string? TryDecodePreferPageNumberWithReader(BarcodeReader reader, Bitmap bmp)
        {
            if (reader == null || bmp == null || bmp.Width < 4 || bmp.Height < 4)
                return null;

            try
            {
                reader.Options ??= new DecodingOptions();
                using var z = new ZxingBitmapHandle(bmp);
                var work = z.Bitmap;
                if (work.Width < 4 || work.Height < 4)
                    return null;
                try
                {
                    var multi = reader.DecodeMultiple(work);
                    if (multi != null && multi.Length > 0)
                    {
                        foreach (var r in multi)
                        {
                            if (string.IsNullOrEmpty(r?.Text)) continue;
                            if (LooksLikePageNumberPayload(r.Text)) return r.Text;
                        }

                        foreach (var r in multi)
                        {
                            if (!string.IsNullOrEmpty(r?.Text)) return r.Text;
                        }
                    }
                }
                catch
                {
                    // ignore — ZXing can throw on some pixel formats / bad state
                }

                try
                {
                    return reader.Decode(work)?.Text;
                }
                catch
                {
                    return null;
                }
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Decodes any supported barcode on the full image; when multiple exist, prefers text that looks like a page index.
        /// </summary>
        private string? ReadBarcodePageOrderAnywhere(Bitmap image)
        {
            var t = TryDecodePreferPageNumber(image);
            if (!string.IsNullOrWhiteSpace(t)) return t;

            try
            {
                // 2× upsample helps thin modules; skip when already huge (decode bitmap should be downscaled upstream).
                if (image.Width * image.Height < 3_500_000)
                {
                    using var up = UpsampleNearest(image, 2);
                    t = TryDecodePreferPageNumber(up);
                    if (!string.IsNullOrWhiteSpace(t)) return t;
                }
            }
            catch
            {
                // ignore
            }

            return TryDecodePreferPageNumberWithReader(_reader, image)
                   ?? TryDecodePreferPageNumberWithReader(_readerRelaxed, image);
        }

        private static bool LooksLikePageNumberPayload(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return false;
            text = text.Trim();
            if (int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out int d) && d > 0)
                return true;
            string[] parts = text.Split('_', StringSplitOptions.RemoveEmptyEntries);
            for (int i = parts.Length - 1; i >= 0; i--)
            {
                if (int.TryParse(parts[i], NumberStyles.Integer, CultureInfo.InvariantCulture, out int p) && p > 0)
                    return true;
            }

            // Embedded digits: "P03", "No.12", "PG0012"
            foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(text, @"\d+"))
            {
                if (int.TryParse(m.Value, NumberStyles.Integer, CultureInfo.InvariantCulture, out int v) && v > 0 && v < 100_000)
                    return true;
            }

            return false;
        }

        /// <summary>Decodes a single symbol from a pixel region (percent-based zones from templates).</summary>
        public string? ReadBarcodeFromRectangle(Bitmap image, Rectangle rect)
        {
            if (image == null || image.Width < 8 || image.Height < 8) return null;
            var r = Rectangle.Intersect(rect, new Rectangle(0, 0, image.Width, image.Height));
            if (r.Width < 4 || r.Height < 4) return null;
            try
            {
                using var crop = image.Clone(r, image.PixelFormat);
                using var z = new ZxingBitmapHandle(crop);
                var work = z.Bitmap;
                if (!NeedsDownscaleForDecode(work))
                    return _reader.Decode(work)?.Text;

                using var scaled = DownscaleForBarcodeDecode(work);
                return _reader.Decode(scaled)?.Text;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>Parses template JSON and reads each zone from the appropriate scanned page (1-based page indices).</summary>
        public Dictionary<string, string> DecodeTemplateZones(IList<Bitmap> pages, string? zonesJson)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (pages == null || pages.Count == 0 || string.IsNullOrWhiteSpace(zonesJson))
                return map;

            List<TemplateBarcodeZone>? zones;
            try
            {
                zones = JsonConvert.DeserializeObject<List<TemplateBarcodeZone>>(zonesJson);
            }
            catch
            {
                return map;
            }

            if (zones == null) return map;

            foreach (var z in zones)
            {
                if (string.IsNullOrWhiteSpace(z.ZoneName)) continue;
                // Per-page serial zones are read during scan / validation, not as a single map entry.
                if (PageSerialZoneHelper.IsReservedPageSerialName(z.ZoneName)) continue;
                int pageIdx;
                if (z.PageScope.Equals("fromPage", StringComparison.OrdinalIgnoreCase))
                    pageIdx = Math.Max(0, z.PageNumber - 1);
                else
                    pageIdx = 0;

                if (pageIdx >= pages.Count) continue;
                var bmp = pages[pageIdx];
                var rect = ZoneToRectangle(bmp, z);
                var text = ReadBarcodeFromRectangle(bmp, rect);
                if (!string.IsNullOrWhiteSpace(text))
                    map[z.ZoneName.Trim()] = text.Trim();
            }

            return map;
        }

        private static Rectangle ZoneToRectangle(Bitmap bmp, TemplateBarcodeZone z)
        {
            double x = z.XPct;
            double y = z.YPct;
            double w = z.WPct;
            double h = z.HPct;
            int px = (int)Math.Round(bmp.Width * x / 100.0);
            int py = (int)Math.Round(bmp.Height * y / 100.0);
            int pw = Math.Max(8, (int)Math.Round(bmp.Width * w / 100.0));
            int ph = Math.Max(8, (int)Math.Round(bmp.Height * h / 100.0));
            return new Rectangle(px, py, pw, ph);
        }

        public string? ReadBarcodeFromFile(string imagePath)
        {
            using var bitmap = new Bitmap(imagePath);
            return ReadBarcode(bitmap);
        }

        /// <summary>
        /// Reads the page-index barcode. When the template defines a <c>pageserialno</c> or <c>pagevalno</c>
        /// zone, uses that rectangle on each eligible page (see <see cref="PageSerialZoneHelper"/>);
        /// otherwise uses footer heuristics.
        /// </summary>
        public string? ReadPageSerialOrFooter(Bitmap image, int pageNumber1Based, int barcodeStartPage1Based, string? zonesJson)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return null;

            var zone = PageSerialZoneHelper.FindPageSerialZone(zonesJson);
            if (zone != null && PageSerialZoneHelper.ShouldApplyPageSerialZone(zone, pageNumber1Based, barcodeStartPage1Based))
            {
                var rect = ZoneToRectangle(image, zone);
                var t = ReadBarcodeFromRectangle(image, rect);
                if (!string.IsNullOrWhiteSpace(t))
                    return t.Trim();
            }

            return ReadBarcodeForPageNumber(image);
        }

        /// <summary>
        /// Decodes the footer page-number barcode. Tries several bottom strip heights (full-page
        /// <see cref="ReadBarcode"/> often misses small Code128 or picks the wrong symbol first).
        /// </summary>
        public string? ReadBarcodeForPageNumber(Bitmap image)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return null;

            foreach (var frac in new[] { 0.40, 0.32, 0.25, 0.18, 0.12 })
            {
                var t = ReadBarcodeFromBottom(image, frac);
                if (!string.IsNullOrWhiteSpace(t) && IsLikelyPageNumberPayload(t)) return t;
            }

            foreach (var frac in new[] { 0.40, 0.32, 0.25, 0.18, 0.12 })
            {
                var t = ReadBarcodeFromBottom(image, frac);
                if (!string.IsNullOrWhiteSpace(t)) return t;
            }

            foreach (var upsample in new[] { false, true })
            {
                foreach (var frac in new[] { 0.50, 0.38, 0.28 })
                {
                    var t = DecodeBottomRegion(image, frac, upsample, preferNumeric: true);
                    if (!string.IsNullOrWhiteSpace(t)) return t;
                }
            }

            foreach (var upsample in new[] { false, true })
            {
                var t = DecodeBottomRegion(image, 0.45, upsample, preferNumeric: false);
                if (!string.IsNullOrWhiteSpace(t)) return t;
            }

            return ReadBarcode(image);
        }

        private string? DecodeBottomRegion(Bitmap image, double bottomFraction, bool upsample, bool preferNumeric)
        {
            try
            {
                double f = Math.Clamp(bottomFraction, 0.08, 0.55);
                int stripH = Math.Max(32, (int)(image.Height * f));
                int y0 = Math.Max(0, image.Height - stripH);
                using var strip = image.Clone(new Rectangle(0, y0, image.Width, stripH), image.PixelFormat);
                if (upsample)
                {
                    using var scaled = UpsampleNearest(strip, 2);
                    return DecodeBitmapForPageNumber(scaled, preferNumeric);
                }

                return DecodeBitmapForPageNumber(strip, preferNumeric);
            }
            catch
            {
                return null;
            }
        }

        private string? DecodeBitmapForPageNumber(Bitmap work, bool preferNumeric)
        {
            try
            {
                using var z = new ZxingBitmapHandle(work);
                var bmp = z.Bitmap;
                var multi = _reader.DecodeMultiple(bmp);
                if (multi != null && multi.Length > 0)
                {
                    if (preferNumeric)
                    {
                        foreach (var r in multi)
                        {
                            if (string.IsNullOrEmpty(r?.Text)) continue;
                            if (IsLikelyPageNumberPayload(r.Text)) return r.Text;
                        }
                    }

                    foreach (var r in multi)
                    {
                        if (!string.IsNullOrEmpty(r?.Text)) return r.Text;
                    }
                }

                try
                {
                    return _reader.Decode(bmp)?.Text;
                }
                catch
                {
                    return null;
                }
            }
            catch
            {
                return null;
            }
        }

        private static bool IsLikelyPageNumberPayload(string text)
        {
            var t = text.Trim();
            if (int.TryParse(t, out int n) && n > 0 && n < 100000) return true;
            var parts = t.Split('_', StringSplitOptions.RemoveEmptyEntries);
            return parts.Length > 0 && int.TryParse(parts[^1].Trim(), out int m) && m > 0;
        }

        public List<string> ReadAllBarcodes(Bitmap image)
        {
            if (image == null || image.Width < 16) return new List<string>();
            if (!NeedsDownscaleForDecode(image))
                return _reader.DecodeMultiple(image)?.Select(r => r.Text).ToList() ?? new List<string>();

            using var scaled = DownscaleForBarcodeDecode(image);
            return _reader.DecodeMultiple(scaled)?.Select(r => r.Text).ToList() ?? new List<string>();
        }

        /// <summary>Returns all barcodes/QR codes with format and text.</summary>
        public List<(string Format, string Text)> ReadAllBarcodesDetailed(Bitmap image)
        {
            if (image == null || image.Width < 16) return new List<(string, string)>();
            Bitmap work = image;
            Bitmap? scaled = null;
            if (NeedsDownscaleForDecode(image))
            {
                scaled = DownscaleForBarcodeDecode(image);
                work = scaled;
            }

            try
            {
                var results = _reader.DecodeMultiple(work);
                if (results == null || results.Length == 0) return new List<(string, string)>();
                return results
                    .Where(r => !string.IsNullOrEmpty(r?.Text))
                    .Select(r => (r!.BarcodeFormat.ToString(), r.Text!))
                    .ToList();
            }
            finally
            {
                scaled?.Dispose();
            }
        }
    }
}
