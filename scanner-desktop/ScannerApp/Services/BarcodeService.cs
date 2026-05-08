using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using ZXing;
using ZXing.Common;
using ZXing.Windows.Compatibility;
using Rectangle = System.Drawing.Rectangle;
using Newtonsoft.Json;
using ScannerApp.Models;
using ScannerApp.Utils;

namespace ScannerApp.Services
{
    public class BarcodeService
    {
        private static readonly double[] BottomFractions = { 0.10, 0.15, 0.20, 0.28, 0.40, 0.50 };
        private static readonly double[] BottomFractionsUpsample = { 0.15, 0.25, 0.40 };

        private static readonly BarcodeFormat LinearFormats =
            BarcodeFormat.CODE_128 | BarcodeFormat.CODE_39 | BarcodeFormat.ITF |
            BarcodeFormat.EAN_13 | BarcodeFormat.EAN_8 | BarcodeFormat.UPC_A |
            BarcodeFormat.UPC_E | BarcodeFormat.CODABAR | BarcodeFormat.CODE_93;

        private static readonly BarcodeFormat AllFormats =
            LinearFormats | BarcodeFormat.QR_CODE | BarcodeFormat.DATA_MATRIX |
            BarcodeFormat.PDF_417 | BarcodeFormat.AZTEC;

        // ── Reader factories (new instance per call — thread-safe) ──

        private static BarcodeReader MakeReaderFast()
        {
            var reader = new BarcodeReader();
            reader.Options = new DecodingOptions
            {
                PossibleFormats = new[] {
                    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
                    BarcodeFormat.ITF, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8
                },
                TryHarder = false,
                TryInverted = false,
            };
            return reader;
        }

        private static BarcodeReader MakeReaderTight()
        {
            var reader = new BarcodeReader();
            reader.Options = new DecodingOptions
            {
                PossibleFormats = new[] {
                    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
                    BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8
                },
                TryHarder = true,
                TryInverted = true,
            };
            reader.AutoRotate = true;
            return reader;
        }

        private static BarcodeReader MakeReaderRelaxed()
        {
            var reader = new BarcodeReader();
            reader.Options = new DecodingOptions
            {
                PossibleFormats = new[] {
                    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
                    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
                    BarcodeFormat.UPC_E, BarcodeFormat.CODABAR, BarcodeFormat.CODE_93,
                    BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
                    BarcodeFormat.PDF_417, BarcodeFormat.AZTEC
                },
                TryHarder = true,
                TryInverted = true,
            };
            reader.AutoRotate = true;
            return reader;
        }

        private static BarcodeReader MakeReaderMulti()
        {
            var reader = new BarcodeReader();
            reader.Options = new DecodingOptions
            {
                PossibleFormats = new[] {
                    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
                    BarcodeFormat.QR_CODE, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8
                },
                TryHarder = true,
                TryInverted = true,
            };
            reader.AutoRotate = true;
            return reader;
        }

        private static BarcodeReader MakeReaderRelaxedMulti()
        {
            var reader = new BarcodeReader();
            reader.Options = new DecodingOptions
            {
                PossibleFormats = new[] {
                    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
                    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
                    BarcodeFormat.UPC_E, BarcodeFormat.CODABAR, BarcodeFormat.CODE_93,
                    BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
                    BarcodeFormat.PDF_417, BarcodeFormat.AZTEC
                },
                TryHarder = true,
                TryInverted = true,
            };
            reader.AutoRotate = true;
            return reader;
        }

        private static BarcodeReader MakeReaderQrOnly()
        {
            var reader = new BarcodeReader();
            reader.Options = new DecodingOptions
            {
                PossibleFormats = new[] { BarcodeFormat.QR_CODE },
                TryHarder = true,
            };
            reader.AutoRotate = true;
            return reader;
        }

        // ── Core decode helpers ──

        private static Result? ZxRead(Bitmap bmp, BarcodeReader reader)
        {
            try
            {
                return reader.Decode(bmp);
            }
            catch
            {
                return null;
            }
        }

        private static Result[]? ZxReadMultiple(Bitmap bmp, BarcodeReader reader)
        {
            try
            {
                return reader.DecodeMultiple(bmp);
            }
            catch
            {
                return null;
            }
        }

        private static string? FirstValue(Result? result)
        {
            if (result == null || string.IsNullOrEmpty(result.Text)) return null;
            return result.Text;
        }

        private static string? FirstValue(Result[]? results)
        {
            if (results == null) return null;
            foreach (var r in results)
                if (!string.IsNullOrEmpty(r.Text)) return r.Text;
            return null;
        }

        private static string? FirstPageNumber(Result? result)
        {
            if (result == null || string.IsNullOrEmpty(result.Text)) return null;
            if (IsLikelyPageNumberPayload(result.Text)) return result.Text.Trim();
            return null;
        }

        private static string? FirstPageNumber(Result[]? results)
        {
            if (results == null) return null;
            foreach (var r in results)
            {
                if (string.IsNullOrEmpty(r.Text)) continue;
                if (IsLikelyPageNumberPayload(r.Text)) return r.Text.Trim();
            }
            return null;
        }

        private static bool IsQrFormat(BarcodeFormat fmt) =>
            fmt == BarcodeFormat.QR_CODE || fmt == BarcodeFormat.DATA_MATRIX ||
            fmt == BarcodeFormat.PDF_417 || fmt == BarcodeFormat.AZTEC;

        // ── Public API ──

        public (string? LinearText, string? QrText) ReadLinearAndQrParallel(Bitmap image)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return (null, null);

            string? lin = null, qr = null;
            try
            {
                var results = ZxReadMultiple(image, MakeReaderMulti());
                if (results != null)
                {
                    foreach (var r in results)
                    {
                        if (string.IsNullOrEmpty(r.Text)) continue;
                        if (IsQrFormat(r.BarcodeFormat)) qr ??= r.Text;
                        else lin ??= r.Text;
                    }
                }
                if (lin == null && qr == null)
                {
                    results = ZxReadMultiple(image, MakeReaderRelaxedMulti());
                    if (results != null)
                    {
                        foreach (var r in results)
                        {
                            if (string.IsNullOrEmpty(r.Text)) continue;
                            if (IsQrFormat(r.BarcodeFormat)) qr ??= r.Text;
                            else lin ??= r.Text;
                        }
                    }
                }
            }
            catch { }
            return (lin, qr);
        }

        public string? ReadBarcode(Bitmap image)
        {
            if (image == null || image.Width < 16 || image.Height < 16) return null;
            return FirstValue(ZxRead(image, MakeReaderTight()))
                ?? FirstValue(ZxRead(image, MakeReaderRelaxed()));
        }

        public string? ReadBarcodeFromFile(string imagePath)
        {
            using var bmp = new Bitmap(imagePath);
            return ReadBarcode(bmp);
        }

        public string? ReadBarcodeFromBottom(Bitmap image, double bottomHeightFraction = 0.22)
        {
            if (image == null || image.Width < 16 || image.Height < 16) return null;
            return TryDecodeBottomStrip(image, bottomHeightFraction, false, MakeReaderTight())
                ?? TryDecodeBottomStrip(image, bottomHeightFraction, false, MakeReaderRelaxed());
        }

        public string? ReadBarcodeFromRectangle(Bitmap image, Rectangle rect)
        {
            if (image == null || image.Width < 8 || image.Height < 8) return null;
            var r = Rectangle.Intersect(rect, new Rectangle(0, 0, image.Width, image.Height));
            if (r.Width < 4 || r.Height < 4) return null;
            try
            {
                using var crop = image.Clone(r, image.PixelFormat);
                return FirstValue(ZxRead(crop, MakeReaderTight()))
                    ?? FirstValue(ZxRead(crop, MakeReaderRelaxed()));
            }
            catch { return null; }
        }

        public string? ReadPageSerialOrFooter(Bitmap image, int pageNumber1Based, int barcodeStartPage1Based, string? zonesJson)
        {
            var (result, _) = ReadPageSerialOrFooterWithDiag(image, pageNumber1Based, barcodeStartPage1Based, zonesJson);
            return result;
        }

        public (string? Result, string Diag) ReadPageSerialOrFooterWithDiag(
            Bitmap image, int pageNumber1Based, int barcodeStartPage1Based, string? zonesJson)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return (null, "image null or too small");

            var diag = new System.Text.StringBuilder();
            diag.Append($"img {image.Width}x{image.Height}");

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

            foreach (var frac in BottomFractions)
            {
                var (t, raw) = TryDecodeBottomStripWithRaw(image, frac, false);
                var rectTxt = BottomStripRectText(image, frac);
                diag.Append($" | bot-{frac:0.##}({rectTxt})={raw ?? "null"}");
                if (t != null) return (t, diag.ToString());
            }

            foreach (var frac in BottomFractionsUpsample)
            {
                var (t, raw) = TryDecodeBottomStripWithRaw(image, frac, true);
                var rectTxt = BottomStripRectText(image, frac);
                diag.Append($" | bot-{frac:0.##}-2x({rectTxt})={raw ?? "null"}");
                if (t != null) return (t, diag.ToString());
            }

            return (null, diag.ToString());
        }

        public string? ReadBarcodeForPageNumber(Bitmap image)
        {
            var (result, _) = ReadPageSerialOrFooterWithDiag(image, 1, 1, null);
            return result;
        }

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
            var results = ZxReadMultiple(image, MakeReaderMulti());
            if (results == null) return new List<string>();
            return results.Select(r => r.Text).Where(v => !string.IsNullOrEmpty(v)).ToList()!;
        }

        public List<(string Format, string Text)> ReadAllBarcodesDetailed(Bitmap image)
        {
            if (image == null || image.Width < 16) return new List<(string, string)>();
            var results = ZxReadMultiple(image, MakeReaderRelaxedMulti());
            if (results == null) return new List<(string, string)>();
            return results
                .Where(r => !string.IsNullOrEmpty(r.Text))
                .Select(r => (r.BarcodeFormat.ToString(), r.Text!))
                .ToList();
        }

        // ── Private helpers ──

        private static string? TryReadSerial(Bitmap work)
        {
            var r = FirstPageNumber(ZxRead(work, MakeReaderFast()));
            if (r != null) return r;
            r = FirstPageNumber(ZxRead(work, MakeReaderTight()));
            if (r != null) return r;
            return FirstPageNumber(ZxRead(work, MakeReaderRelaxed()));
        }

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
                    foreach (var reader in new[] { MakeReaderFast(), MakeReaderTight(), MakeReaderRelaxed() })
                    {
                        var results = ZxReadMultiple(work, reader);
                        if (results == null) continue;
                        foreach (var r in results)
                        {
                            if (string.IsNullOrEmpty(r.Text)) continue;
                            raw ??= r.Text;
                            if (IsLikelyPageNumberPayload(r.Text)) return (r.Text.Trim(), r.Text);
                        }
                    }
                    return (null, raw);
                }
                finally { upscaled?.Dispose(); }
            }
            catch { return (null, null); }
        }

        private static string? TryDecodeBottomStrip(Bitmap image, double frac, bool upsample, BarcodeReader reader)
        {
            try
            {
                int stripH = Math.Max(32, (int)(image.Height * frac));
                int y0 = Math.Max(0, image.Height - stripH);
                using var strip = image.Clone(new Rectangle(0, y0, image.Width, stripH), image.PixelFormat);
                Bitmap? upscaled = upsample ? UpsampleNearest(strip, 2) : null;
                Bitmap work = upscaled ?? strip;
                try { return FirstValue(ZxRead(work, reader)); }
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
