using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using AForge.Imaging;
using AForge.Imaging.Filters;
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

        /// <summary>Exam page serials are almost always CODE_128; try this before broader format sets.</summary>
        private static BarcodeReader MakeReaderCode128Focused()
        {
            var reader = new BarcodeReader();
            reader.Options = new DecodingOptions
            {
                PossibleFormats = new[] {
                    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
                },
                TryHarder = true,
                TryInverted = true,
            };
            reader.AutoRotate = true;
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
                void Take(Result? res)
                {
                    if (res == null || string.IsNullOrEmpty(res.Text)) return;
                    if (IsQrFormat(res.BarcodeFormat)) qr ??= res.Text;
                    else lin ??= res.Text;
                }

                void TakeMany(Result[]? arr)
                {
                    if (arr == null) return;
                    foreach (var r in arr)
                    {
                        if (string.IsNullOrEmpty(r.Text)) continue;
                        if (IsQrFormat(r.BarcodeFormat)) qr ??= r.Text;
                        else lin ??= r.Text;
                    }
                }

                // Single-barcode path first (much faster than DecodeMultiple on full pages).
                var multi = MakeReaderMulti();
                Take(ZxRead(image, multi));
                if (lin == null || qr == null)
                    TakeMany(ZxReadMultiple(image, multi));

                if (lin == null && qr == null)
                {
                    var relaxed = MakeReaderRelaxedMulti();
                    Take(ZxRead(image, relaxed));
                    if (lin == null || qr == null)
                        TakeMany(ZxReadMultiple(image, relaxed));
                }
            }
            catch { }
            return (lin, qr);
        }

        public string? ReadBarcode(Bitmap image)
        {
            if (image == null || image.Width < 16 || image.Height < 16) return null;
            return FirstValue(ZxRead(image, MakeReaderTight()))
                ?? FirstValue(ZxReadMultiple(image, MakeReaderTight()))
                ?? FirstValue(ZxRead(image, MakeReaderRelaxed()))
                ?? FirstValue(ZxReadMultiple(image, MakeReaderRelaxed()));
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
                    ?? FirstValue(ZxReadMultiple(crop, MakeReaderTight()))
                    ?? FirstValue(ZxRead(crop, MakeReaderRelaxed()))
                    ?? FirstValue(ZxReadMultiple(crop, MakeReaderRelaxed()));
            }
            catch { return null; }
        }

        public string? ReadPageSerialOrFooter(Bitmap image, int pageNumber1Based, int barcodeStartPage1Based, string? zonesJson)
        {
            var (result, _, _) = ReadPageSerialOrFooterWithDiag(image, pageNumber1Based, barcodeStartPage1Based, zonesJson);
            return result;
        }

        /// <param name="BoundsOnImage">Axis-aligned barcode region in <paramref name="image"/> pixels when decode succeeded on the same bitmap (otherwise null).</param>
        public (string? Result, string Diag, Rectangle? BoundsOnImage) ReadPageSerialOrFooterWithDiag(
            Bitmap image, int pageNumber1Based, int barcodeStartPage1Based, string? zonesJson)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return (null, "image null or too small", null);

            var totalSw = System.Diagnostics.Stopwatch.StartNew();
            var diag = new System.Text.StringBuilder();
            diag.Append($"img {image.Width}x{image.Height} pixfmt={image.PixelFormat}");
            diag.Append(" | pageSerial=template-zone(+optional pad,+refinements+downscale) then br-corner (50/45/40%) + inkBoost + rot180 fallback");

            var start = Math.Max(1, barcodeStartPage1Based);
            if (pageNumber1Based < start)
            {
                diag.Append($" | skip page<{start}");
                return (null, diag.ToString(), null);
            }

            var imgBounds = new Rectangle(0, 0, image.Width, image.Height);
            diag.Append($" | key={PageSerialZoneHelper.PrimaryZoneKey}");

            // Surface the raw template zone definition so failure logs include the exact
            // operator-configured percentages — invaluable when the rectangle is wrong.
            var pageSerialZone = PageSerialZoneHelper.FindPageSerialZone(zonesJson);
            if (pageSerialZone != null)
            {
                diag.Append($" | zone%(x={pageSerialZone.XPct:0.##} y={pageSerialZone.YPct:0.##} " +
                            $"w={pageSerialZone.WPct:0.##} h={pageSerialZone.HPct:0.##} " +
                            $"scope={pageSerialZone.PageScope} fromPage={pageSerialZone.PageNumber})");
            }
            else diag.Append(" | zone%=(none)");

            var passes = new List<(Rectangle Rect, string Tag)>(8);
            Rectangle zoneRectForDump = Rectangle.Empty;
            if (PageSerialZoneHelper.TryGetPageSerialPixelRectangle(
                    image.Width, image.Height, zonesJson, pageNumber1Based, start, out var zoneRect))
            {
                zoneRectForDump = zoneRect;
                passes.Add((zoneRect, "zone"));
                diag.Append($" | templateCrop x={zoneRect.X} y={zoneRect.Y} w={zoneRect.Width} h={zoneRect.Height}");
                // Tight operator zones are fast but occasionally clip the barcode (skew /
                // print shift). One padded rectangle reuses the same refinement ladder with
                // minimal extra work vs. widening the template for every sheet.
                int padX = Math.Clamp(Math.Max(6, zoneRect.Width / 12), 6, 48);
                int padY = Math.Clamp(Math.Max(6, zoneRect.Height / 12), 6, 72);
                var zonePad = InflateRectangleWithin(zoneRect, padX, padY, imgBounds);
                if (zonePad.Width > zoneRect.Width || zonePad.Height > zoneRect.Height)
                {
                    passes.Add((zonePad, "zonePad"));
                    diag.Append($" | zonePad x={zonePad.X} y={zonePad.Y} w={zonePad.Width} h={zonePad.Height} pad=±{padX}/{padY}");
                }
            }
            else
                diag.Append(" | templateCrop=(none or n/a)");

            foreach (var (frac, tag) in new[] { (0.5, "50"), (0.45, "45"), (0.40, "40") })
                passes.Add((BottomRightCornerRectangle(image, frac), $"br{tag}"));

            // Capture every crop we attempt so we can dump them on final failure.
            // Each entry is the source bitmap (rgb) at original orientation; on hit
            // they are disposed via using; on miss we keep one copy per pass for the dump.
            List<(string Tag, Rectangle Rect, Bitmap Crop)>? failedCrops = null;
            string? cropDumpDir = SafeReadFailureDumpDir();
            if (!string.IsNullOrWhiteSpace(cropDumpDir))
                failedCrops = new List<(string, Rectangle, Bitmap)>();

            try
            {
                foreach (var (rect, passTag) in passes)
                {
                    foreach (var (subRect, diagTag) in EnumerateSerialDecodeRects(rect, imgBounds, passTag))
                    {
                        try
                        {
                            if (subRect.Width < 4 || subRect.Height < 4) continue;
                            using var crop = image.Clone(subRect, image.PixelFormat);
                            using var rgb = CopyToRgb24(crop);
                            using var down = DownscaleIfLargeForDecode(rgb, 2000);
                            Bitmap[] sources = down != null ? new[] { down, rgb } : new[] { rgb };
                            foreach (var srcRgb in sources)
                            {
                                string srcSuffix = down != null && ReferenceEquals(srcRgb, down) ? "-ds" : "";

                                // ── 1a) Raw decode at 1× ──
                                {
                                    var passSw = System.Diagnostics.Stopwatch.StartNew();
                                    var (t, zxRes) = TryReadSerialDirectWithResult(srcRgb);
                                    passSw.Stop();
                                    if (t != null)
                                    {
                                        diag.Append($" => {diagTag}{srcSuffix}-1x ({passSw.ElapsedMilliseconds}ms) \"{t}\"");
                                        diag.Append($" | totalMs={totalSw.ElapsedMilliseconds}");
                                        var bounds = MapLinearBarcodeBoundsToPage(
                                            zxRes, subRect, new Size(rgb.Width, rgb.Height), srcRgb.Size, image.Size);
                                        return (t, diag.ToString(), bounds);
                                    }
                                }

                                // ── 1b) Soft-blur at 1×: 3×3 mean filter smooths scan noise
                                // and single-pixel aliasing that confuses ZXing's binariser.
                                // Cheap (~1 ms) and proven to recover borderline 150-DPI
                                // blue-ink barcodes that fail on raw pixel data. ──
                                try
                                {
                                    using var blurred = MeanFilter3x3(srcRgb);
                                    var (bt, bz) = TryReadSerialDirectWithResult(blurred);
                                    if (bt != null)
                                    {
                                        diag.Append($" => {diagTag}{srcSuffix}-blur \"{bt}\"");
                                        diag.Append($" | totalMs={totalSw.ElapsedMilliseconds}");
                                        var bBounds = MapLinearBarcodeBoundsToPage(
                                            bz, subRect, new Size(rgb.Width, rgb.Height), blurred.Size, image.Size);
                                        return (bt, diag.ToString(), bBounds);
                                    }
                                }
                                catch { }

                                // ── 2) Upscale 2× and 3× (skip for crops already ≥ 600 px) ──
                                foreach (int scale in ScaleLadderFor(srcRgb))
                                {
                                    if (scale <= 1) continue; // already tried 1× above
                                    Bitmap? scaled = UpsampleBicubic(srcRgb, scale);
                                    try
                                    {
                                        var (t, zxRes) = TryReadSerialDirectWithResult(scaled);
                                        if (t != null)
                                        {
                                            diag.Append($" => {diagTag}{srcSuffix}-{scale}x \"{t}\"");
                                            diag.Append($" | totalMs={totalSw.ElapsedMilliseconds}");
                                            var bounds = MapLinearBarcodeBoundsToPage(
                                                zxRes, subRect, new Size(rgb.Width, rgb.Height), scaled.Size, image.Size);
                                            return (t, diag.ToString(), bounds);
                                        }
                                    }
                                    finally { scaled.Dispose(); }
                                }

                                // ── 3) Ink boost (Otsu binary + red-channel stretch + BT709) ──
                                var (ink, inkRes) = TryReadSerialWithInkBoostWithResult(srcRgb);
                                if (ink != null)
                                {
                                    diag.Append($" => {diagTag}{srcSuffix}-ink1x \"{ink}\"");
                                    diag.Append($" | totalMs={totalSw.ElapsedMilliseconds}");
                                    var bInk = MapLinearBarcodeBoundsToPage(
                                        inkRes, subRect, new Size(rgb.Width, rgb.Height), srcRgb.Size, image.Size);
                                    return (ink, diag.ToString(), bInk);
                                }

                                if (Math.Max(srcRgb.Width, srcRgb.Height) < 1600)
                                {
                                    using var up2 = UpsampleBicubic(srcRgb, 2);
                                    (ink, inkRes) = TryReadSerialWithInkBoostWithResult(up2);
                                    if (ink != null)
                                    {
                                        diag.Append($" => {diagTag}{srcSuffix}-ink2x \"{ink}\"");
                                        diag.Append($" | totalMs={totalSw.ElapsedMilliseconds}");
                                        var bInk2 = MapLinearBarcodeBoundsToPage(
                                            inkRes, subRect, new Size(rgb.Width, rgb.Height), up2.Size, image.Size);
                                        return (ink, diag.ToString(), bInk2);
                                    }
                                }
                            }

                            if (failedCrops != null)
                                failedCrops.Add((diagTag, subRect, (Bitmap)rgb.Clone()));
                        }
                        catch (Exception ex)
                        {
                            diag.Append($" | err({diagTag}): {ex.GetType().Name}");
                        }
                    }
                }

                // ── Final fallback: try the SAME zone crop on a 180°-rotated copy of the
                // full image. Catches the case where the scanner (or auto-orient) flipped
                // a back-side sheet so the printed barcode is now in the OPPOSITE corner of
                // the captured image — ZXing's per-crop AutoRotate cannot help when the
                // barcode is outside the cropped region entirely.
                var rotResult = TryRotatedPageFallback(image, zonesJson, pageNumber1Based, start, diag);
                if (rotResult != null)
                {
                    diag.Append($" | totalMs={totalSw.ElapsedMilliseconds}");
                    return (rotResult, diag.ToString(), null);
                }

                diag.Append($" => null totalMs={totalSw.ElapsedMilliseconds}");

                if (failedCrops is { Count: > 0 } && !string.IsNullOrWhiteSpace(cropDumpDir))
                {
                    try
                    {
                        var savedFiles = DumpFailedCrops(image, failedCrops, cropDumpDir, pageNumber1Based, zoneRectForDump);
                        if (savedFiles.Count > 0)
                            diag.Append($" | dumped {savedFiles.Count} crops -> {savedFiles[0]}…");
                    }
                    catch (Exception ex)
                    {
                        diag.Append($" | dumpErr: {ex.Message}");
                    }
                }

                return (null, diag.ToString(), null);
            }
            finally
            {
                if (failedCrops != null)
                {
                    foreach (var (_, _, bmp) in failedCrops)
                    {
                        try { bmp.Dispose(); } catch { /* ignore */ }
                    }
                }
            }
        }

        /// <summary>
        /// Decides which integer upsample factors to try for a given crop. Skips 3× once
        /// the crop is already large — at &gt;=1500 px max edge, 3× yields a 4500-px image
        /// which is slow with <c>TryHarder + TryInverted</c> and very rarely improves the hit
        /// rate over 2×. This is what shrinks the per-failure cost from ~13 s to ~5 s.
        /// </summary>
        private static int[] ScaleLadderFor(Bitmap src)
        {
            int mx = Math.Max(src.Width, src.Height);
            if (mx >= 1500) return new[] { 1 };
            if (mx >= 600)  return new[] { 1, 2 };
            return new[] { 1, 2, 3 };
        }

        /// <summary>
        /// Last-resort decode: rotate the full image 180° and retry the same template zone.
        /// Useful when the scanner produces a flipped back-side page (or the operator fed a
        /// sheet upside-down) — the configured rectangle then points at the wrong area of
        /// the captured image, and per-crop <c>AutoRotate</c> cannot recover.
        /// </summary>
        private static string? TryRotatedPageFallback(
            Bitmap image, string? zonesJson, int pageNumber1Based, int start, System.Text.StringBuilder diag)
        {
            if (!PageSerialZoneHelper.TryGetPageSerialPixelRectangle(
                    image.Width, image.Height, zonesJson, pageNumber1Based, start, out var origZone))
                return null;

            Bitmap? rotated = null;
            try
            {
                rotated = (Bitmap)image.Clone();
                rotated.RotateFlip(RotateFlipType.Rotate180FlipNone);

                // Reflect the zone through the page center so the barcode that was at the
                // original (x,y) is now at (W-x-w, H-y-h) in the rotated image.
                int rx = image.Width  - origZone.X - origZone.Width;
                int ry = image.Height - origZone.Y - origZone.Height;
                var rotZone = Rectangle.Intersect(
                    new Rectangle(rx, ry, origZone.Width, origZone.Height),
                    new Rectangle(0, 0, rotated.Width, rotated.Height));
                if (rotZone.Width < 4 || rotZone.Height < 4) return null;

                using var crop = rotated.Clone(rotZone, rotated.PixelFormat);
                using var rgb  = CopyToRgb24(crop);
                foreach (int scale in ScaleLadderFor(rgb))
                {
                    Bitmap? scaled = scale > 1 ? UpsampleBicubic(rgb, scale) : null;
                    try
                    {
                        var t = TryReadSerial(scaled ?? rgb);
                        if (t != null)
                        {
                            diag.Append($" => rot180-zone-{scale}x \"{t}\"");
                            return t;
                        }
                        t = TryReadSerialWithInkBoost(scaled ?? rgb);
                        if (t != null)
                        {
                            diag.Append($" => rot180-zone-{scale}x-ink \"{t}\"");
                            return t;
                        }
                    }
                    finally { scaled?.Dispose(); }
                }
            }
            catch (Exception ex)
            {
                diag.Append($" | rot180 err: {ex.GetType().Name}");
            }
            finally
            {
                try { rotated?.Dispose(); } catch { /* ignore */ }
            }

            return null;
        }

        public string? ReadBarcodeForPageNumber(Bitmap image)
        {
            var (result, _, _) = ReadPageSerialOrFooterWithDiag(image, 1, 1, null);
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

        /// <summary>Large template zones (e.g. full footer band) often contain a small barcode; ZXing is more reliable on tighter crops.</summary>
        private static IEnumerable<(Rectangle Rect, string DiagTag)> EnumerateSerialDecodeRects(
            Rectangle rect, Rectangle imgBounds, string passTag)
        {
            var zr = Rectangle.Intersect(rect, imgBounds);
            if (zr.Width < 4 || zr.Height < 4) yield break;
            if (passTag == "zone" || passTag == "zonePad")
            {
                foreach (var pair in EnumerateTemplateZoneRefinements(zr))
                    yield return pair;
            }
            else
                yield return (zr, passTag);
        }

        private static IEnumerable<(Rectangle Rect, string DiagTag)> EnumerateTemplateZoneRefinements(Rectangle z)
        {
            yield return (z, "zone");
            // Bottom strips from wide → narrow. A tall zone (e.g. 25% of page height) often
            // includes handwriting above the footer; the bottom 38% can be pure white margin
            // while the barcode sits slightly higher — wider strips (b55) fix that pattern.
            foreach (var (frac, tag) in new[] { (0.55, "b55"), (0.38, "b38"), (0.22, "b22") })
            {
                int bh = Math.Max(32, (int)(z.Height * frac));
                int y0 = Math.Max(z.Y, z.Bottom - bh);
                int hStrip = z.Bottom - y0;
                if (z.Width >= 4 && hStrip >= 4)
                    yield return (new Rectangle(z.X, y0, z.Width, hStrip), $"zone-{tag}");
            }
            int rw = Math.Max(32, (int)(z.Width * 0.45));
            int x0 = Math.Max(z.X, z.Right - rw);
            int wStrip = z.Right - x0;
            if (wStrip >= 4 && z.Height >= 4)
                yield return (new Rectangle(x0, z.Y, wStrip, z.Height), "zone-r45");
            int qx = z.X + z.Width / 2;
            int qy = z.Y + z.Height / 2;
            var brq = new Rectangle(qx, qy, Math.Max(8, z.Right - qx), Math.Max(8, z.Bottom - qy));
            yield return (brq, "zone-br");
        }

        private static string? SafeReadFailureDumpDir()
        {
            try
            {
                var v = AppConfig.BarcodeFailureCropDir;
                return string.IsNullOrWhiteSpace(v) ? null : v;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Writes each attempted crop plus a full-page outline JPEG so the unread barcode can
        /// be inspected. Files land under <c>cropDir/&lt;timestamp&gt;-pNN/&lt;tag&gt;.jpg</c>.
        /// </summary>
        private static List<string> DumpFailedCrops(
            Bitmap image,
            List<(string Tag, Rectangle Rect, Bitmap Crop)> failedCrops,
            string cropDir,
            int pageNumber1Based,
            Rectangle zoneRect)
        {
            var saved = new List<string>();
            try
            {
                Directory.CreateDirectory(cropDir);
                var stamp = DateTime.Now.ToString("yyyyMMdd-HHmmss-fff");
                var subDir = Path.Combine(cropDir, $"{stamp}-p{pageNumber1Based:D3}");
                Directory.CreateDirectory(subDir);

                int idx = 0;
                foreach (var (tag, rect, crop) in failedCrops)
                {
                    var name = $"{idx:D2}_{tag}_x{rect.X}_y{rect.Y}_w{rect.Width}_h{rect.Height}.jpg";
                    var path = Path.Combine(subDir, name);
                    try
                    {
                        crop.Save(path, ImageFormat.Jpeg);
                        saved.Add(path);
                    }
                    catch
                    {
                        // single-crop failure should not abort the rest of the dump
                    }
                    idx++;
                }

                // Annotate the original page with the template zone outline so the operator
                // can see exactly where the decoder was looking.
                try
                {
                    using var annotated = new Bitmap(image.Width, image.Height, PixelFormat.Format24bppRgb);
                    using (var g = Graphics.FromImage(annotated))
                    {
                        g.DrawImage(image, 0, 0, image.Width, image.Height);
                        if (zoneRect.Width > 0 && zoneRect.Height > 0)
                        {
                            using var fill = new SolidBrush(Color.FromArgb(70, 255, 90, 30));
                            g.FillRectangle(fill, zoneRect);
                            using var pen = new Pen(Color.Red, Math.Max(2f, image.Width / 700f));
                            g.DrawRectangle(pen, zoneRect);
                        }
                    }
                    var fullPath = Path.Combine(subDir, "_page_with_zone.jpg");
                    annotated.Save(fullPath, ImageFormat.Jpeg);
                    saved.Add(fullPath);
                }
                catch
                {
                    // page-overview dump is best-effort
                }
            }
            catch
            {
                // dump should never break the decode path
            }
            return saved;
        }

        /// <summary>When the linear crop is very large, a bicubic downscale can improve ZXing stability.</summary>
        private static Bitmap? DownscaleIfLargeForDecode(Bitmap src, int maxEdge)
        {
            int mx = Math.Max(src.Width, src.Height);
            if (mx <= maxEdge) return null;
            double s = maxEdge / (double)mx;
            int nw = Math.Max(8, (int)Math.Round(src.Width * s));
            int nh = Math.Max(8, (int)Math.Round(src.Height * s));
            var dst = new Bitmap(nw, nh, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.DrawImage(src, 0, 0, nw, nh);
            }
            return dst;
        }

        /// <summary>
        /// Page-serial decode: tries cheap <see cref="ZxRead"/> before <see cref="ZxReadMultiple"/> per reader.
        /// IronBarcode / commercial SDKs often short-circuit on the first symbology; ZXing's DecodeMultiple
        /// scans the whole luminance plane repeatedly and was dominating wall time on large crops.
        /// </summary>
        private static Rectangle? MapLinearBarcodeBoundsToPage(
            Result? res,
            Rectangle subRectOnPage,
            Size rgbCropDimensions,
            Size decodeBitmapSize,
            Size pageSize)
        {
            if (res?.ResultPoints == null || res.ResultPoints.Length == 0) return null;
            if (decodeBitmapSize.Width < 1 || decodeBitmapSize.Height < 1) return null;

            float minx = float.MaxValue, miny = float.MaxValue, maxx = float.MinValue, maxy = float.MinValue;
            foreach (var p in res.ResultPoints)
            {
                if (p.X < minx) minx = p.X;
                if (p.Y < miny) miny = p.Y;
                if (p.X > maxx) maxx = p.X;
                if (p.Y > maxy) maxy = p.Y;
            }

            float bw = maxx - minx;
            float bh = maxy - miny;
            if (bw < 12f)
            {
                float cx = (minx + maxx) * 0.5f;
                minx = cx - 14f;
                maxx = cx + 14f;
            }
            if (bh < 10f)
            {
                float cy = (miny + maxy) * 0.5f;
                miny = cy - 8f;
                maxy = cy + 8f;
            }

            const float pad = 4f;
            minx -= pad; miny -= pad; maxx += pad; maxy += pad;

            float sx = rgbCropDimensions.Width / (float)decodeBitmapSize.Width;
            float sy = rgbCropDimensions.Height / (float)decodeBitmapSize.Height;

            var pageRect = Rectangle.FromLTRB(
                subRectOnPage.X + (int)Math.Floor(minx * sx),
                subRectOnPage.Y + (int)Math.Floor(miny * sy),
                subRectOnPage.X + (int)Math.Ceiling(maxx * sx),
                subRectOnPage.Y + (int)Math.Ceiling(maxy * sy));

            pageRect.Intersect(new Rectangle(Point.Empty, pageSize));
            return pageRect.Width >= 4 && pageRect.Height >= 4 ? pageRect : null;
        }

        private static Result? FirstPageNumberResult(Result[]? results)
        {
            if (results == null) return null;
            foreach (var r in results)
            {
                if (r == null || string.IsNullOrEmpty(r.Text)) continue;
                if (IsLikelyPageNumberPayload(r.Text)) return r;
            }
            return null;
        }

        private static Result? FirstReasonableLinearResult(Result[]? results)
        {
            if (results == null) return null;
            foreach (var r in results)
            {
                if (string.IsNullOrEmpty(r.Text) || IsQrFormat(r.BarcodeFormat)) continue;
                var t = r.Text.Trim();
                if (LooksLikeSerialToken(t)) return r;
            }
            return null;
        }

        /// <summary>Same reader order as legacy serial decode but keeps the ZXing result for preview mapping.</summary>
        private static (string? Text, Result? Zx) TryReadSerialDirectWithResult(Bitmap work)
        {
            foreach (var reader in new[] { MakeReaderCode128Focused(), MakeReaderFast(), MakeReaderTight(), MakeReaderRelaxed() })
            {
                var z = ZxRead(work, reader);
                var r = FirstPageNumber(z);
                if (r != null) return (r, z);
                var arr = ZxReadMultiple(work, reader);
                var r2 = FirstPageNumber(arr);
                if (r2 != null) return (r2, FirstPageNumberResult(arr));
            }

            foreach (var reader in new[] { MakeReaderTight(), MakeReaderRelaxed() })
            {
                var z = ZxRead(work, reader);
                if (FirstReasonableLinearSerial(z) != null) return (z!.Text.Trim(), z);
                var arr = ZxReadMultiple(work, reader);
                var r2 = FirstReasonableLinearSerial(arr);
                if (r2 != null) return (r2, FirstReasonableLinearResult(arr));
            }

            return (null, null);
        }

        private static string? TryReadSerialDirect(Bitmap work) => TryReadSerialDirectWithResult(work).Text;

        private static string? TryReadSerial(Bitmap work) => TryReadSerialDirect(work);

        private static (string? Text, Result? Zx) TryReadSerialWithInkBoostWithResult(Bitmap rgb24)
        {
            if (rgb24 == null || rgb24.PixelFormat != PixelFormat.Format24bppRgb) return (null, null);

            // Strategy 1: Conservative red-channel binary at fixed low threshold.
            // Blue-ink bars have R ~140-170; a threshold of 160 captures ONLY the
            // darkest ink while ignoring lighter template lines (R ~170-200),
            // producing much cleaner bars than Otsu on template-heavy images.
            try
            {
                using var bwLow = RedChannelFixedBinary(rgb24, 160);
                var (t, r) = TryReadSerialDirectWithResult(bwLow);
                if (t != null) return (t, r);
            }
            catch { }

            // Strategy 2: Red-channel → Otsu binary threshold.
            try
            {
                using var bw = RedChannelOtsuBinary(rgb24);
                var (t, r) = TryReadSerialDirectWithResult(bw);
                if (t != null) return (t, r);
            }
            catch { }

            // Strategy 3: Red-channel → contrast stretch → grayscale (softer fallback).
            try
            {
                using var rcGray = ExtractRedChannelAsRgb24(rgb24, stretch: true);
                var (t, r) = TryReadSerialDirectWithResult(rcGray);
                if (t != null) return (t, r);
            }
            catch { }

            // Strategy 4: BT709 luminance + contrast stretch (handles black ink).
            try
            {
                using var gray = Grayscale.CommonAlgorithms.BT709.Apply(rgb24);
                using var stretched = new ContrastStretch().Apply(gray);
                using var sharpened = new Sharpen().Apply(stretched);
                using var backRgb = new GrayscaleToRGB().Apply(sharpened);
                return TryReadSerialDirectWithResult(backRgb);
            }
            catch
            {
                return (null, null);
            }
        }

        /// <summary>
        /// Extracts the red channel, computes Otsu threshold, and produces a clean 24bpp
        /// black-on-white binary image ideal for 1D barcode decoding.  Blue/cyan ink absorbs
        /// red light heavily (R ~ 100–160) while white paper reflects it (R ~ 230–250), so
        /// the red channel gives the widest separation for threshold-based binarisation.
        /// </summary>
        private static unsafe Bitmap RedChannelOtsuBinary(Bitmap src)
        {
            int w = src.Width, h = src.Height;
            var srcData = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            int srcStride = srcData.Stride;

            int[] hist = new int[256];
            for (int y = 0; y < h; y++)
            {
                byte* row = (byte*)srcData.Scan0 + y * srcStride;
                for (int x = 0; x < w; x++)
                    hist[row[x * 3 + 2]]++;          // red channel (BGR offset 2)
            }

            int threshold = OtsuThreshold(hist, w * h);

            var dst = new Bitmap(w, h, PixelFormat.Format24bppRgb);
            var dstData = dst.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
            int dstStride = dstData.Stride;
            try
            {
                for (int y = 0; y < h; y++)
                {
                    byte* sRow = (byte*)srcData.Scan0 + y * srcStride;
                    byte* dRow = (byte*)dstData.Scan0 + y * dstStride;
                    for (int x = 0; x < w; x++)
                    {
                        byte v = sRow[x * 3 + 2] >= threshold ? (byte)255 : (byte)0;
                        int o = x * 3;
                        dRow[o] = dRow[o + 1] = dRow[o + 2] = v;
                    }
                }
            }
            finally
            {
                src.UnlockBits(srcData);
                dst.UnlockBits(dstData);
            }
            return dst;
        }

        /// <summary>
        /// Red-channel binary with a caller-specified threshold.  Useful for
        /// conservative thresholds (e.g. 160) that isolate only the darkest ink,
        /// avoiding noise from lighter template elements that Otsu would include.
        /// </summary>
        private static unsafe Bitmap RedChannelFixedBinary(Bitmap src, int threshold)
        {
            int w = src.Width, h = src.Height;
            var srcData = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            var dst = new Bitmap(w, h, PixelFormat.Format24bppRgb);
            dst.SetResolution(src.HorizontalResolution, src.VerticalResolution);
            var dstData = dst.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
            try
            {
                for (int y = 0; y < h; y++)
                {
                    byte* sRow = (byte*)srcData.Scan0 + y * srcData.Stride;
                    byte* dRow = (byte*)dstData.Scan0 + y * dstData.Stride;
                    for (int x = 0; x < w; x++)
                    {
                        byte v = sRow[x * 3 + 2] >= threshold ? (byte)255 : (byte)0;
                        int o = x * 3;
                        dRow[o] = dRow[o + 1] = dRow[o + 2] = v;
                    }
                }
            }
            finally
            {
                src.UnlockBits(srcData);
                dst.UnlockBits(dstData);
            }
            return dst;
        }

        /// <summary>
        /// Extracts the red channel as a 24bpp RGB grayscale image (R=G=B=red),
        /// optionally with contrast-stretch for softer decode attempts.
        /// </summary>
        private static unsafe Bitmap ExtractRedChannelAsRgb24(Bitmap src, bool stretch)
        {
            int w = src.Width, h = src.Height;
            var dst = new Bitmap(w, h, PixelFormat.Format24bppRgb);
            var srcData = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            var dstData = dst.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
            try
            {
                int minR = 255, maxR = 0;
                if (stretch)
                {
                    for (int y = 0; y < h; y++)
                    {
                        byte* row = (byte*)srcData.Scan0 + y * srcData.Stride;
                        for (int x = 0; x < w; x++)
                        {
                            byte r = row[x * 3 + 2];
                            if (r < minR) minR = r;
                            if (r > maxR) maxR = r;
                        }
                    }
                }
                int range = Math.Max(1, maxR - minR);

                for (int y = 0; y < h; y++)
                {
                    byte* sRow = (byte*)srcData.Scan0 + y * srcData.Stride;
                    byte* dRow = (byte*)dstData.Scan0 + y * dstData.Stride;
                    for (int x = 0; x < w; x++)
                    {
                        byte r = sRow[x * 3 + 2];
                        byte v = stretch ? (byte)Math.Clamp((r - minR) * 255 / range, 0, 255) : r;
                        int o = x * 3;
                        dRow[o] = dRow[o + 1] = dRow[o + 2] = v;
                    }
                }
            }
            finally
            {
                src.UnlockBits(srcData);
                dst.UnlockBits(dstData);
            }
            return dst;
        }

        /// <summary>Otsu's method: find the threshold that minimises intra-class variance.</summary>
        private static int OtsuThreshold(int[] hist, int totalPixels)
        {
            long sumAll = 0;
            for (int i = 0; i < 256; i++) sumAll += (long)i * hist[i];

            long sumB = 0;
            int wB = 0;
            double best = 0;
            int threshold = 128;
            for (int t = 0; t < 256; t++)
            {
                wB += hist[t];
                if (wB == 0) continue;
                int wF = totalPixels - wB;
                if (wF == 0) break;
                sumB += (long)t * hist[t];
                double mB = sumB / (double)wB;
                double mF = (sumAll - sumB) / (double)wF;
                double diff = mB - mF;
                double between = (double)wB * wF * diff * diff;
                if (between > best) { best = between; threshold = t; }
            }
            return threshold;
        }

        /// <summary>
        /// Second-pass decode for blue-ink linear barcodes on white paper with show-through.
        /// Converts to luminance, stretches contrast, light sharpen, then feeds ZXing a
        /// synthetic RGB image (same pipeline operators use when inspecting failure-folder crops).
        /// </summary>
        private static string? TryReadSerialWithInkBoost(Bitmap rgb24) =>
            TryReadSerialWithInkBoostWithResult(rgb24).Text;

        /// <summary>
        /// 3×3 box (mean) filter on a 24bpp RGB bitmap. Smooths single-pixel noise and scan
        /// aliasing that derails ZXing's HybridBinarizer on borderline 150 DPI barcodes.
        /// Equivalent to the slight smoothing JPEG compression introduces — tested to
        /// consistently recover blue-ink Code128 barcodes that fail on raw pixel data.
        /// </summary>
        private static unsafe Bitmap MeanFilter3x3(Bitmap src)
        {
            int w = src.Width, h = src.Height;
            var dst = new Bitmap(w, h, PixelFormat.Format24bppRgb);
            var sData = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            var dData = dst.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
            int ss = sData.Stride, ds = dData.Stride;
            for (int y = 0; y < h; y++)
            {
                byte* dRow = (byte*)dData.Scan0 + y * ds;
                for (int x = 0; x < w; x++)
                {
                    int sumB = 0, sumG = 0, sumR = 0, cnt = 0;
                    for (int dy = -1; dy <= 1; dy++)
                    {
                        int ny = y + dy;
                        if ((uint)ny >= (uint)h) continue;
                        byte* sRow = (byte*)sData.Scan0 + ny * ss;
                        for (int dx = -1; dx <= 1; dx++)
                        {
                            int nx = x + dx;
                            if ((uint)nx >= (uint)w) continue;
                            byte* p = sRow + nx * 3;
                            sumB += p[0]; sumG += p[1]; sumR += p[2]; cnt++;
                        }
                    }
                    int o = x * 3;
                    dRow[o]     = (byte)(sumB / cnt);
                    dRow[o + 1] = (byte)(sumG / cnt);
                    dRow[o + 2] = (byte)(sumR / cnt);
                }
            }
            src.UnlockBits(sData);
            dst.UnlockBits(dData);
            return dst;
        }

        /// <summary>
        /// Normalize any bitmap to 24bpp RGB for ZXing (indexed/32bpp sources are unreliable).
        /// Matches source DPI to avoid GDI+ interpolation artifacts when scanner JPEGs carry
        /// 300 DPI metadata but the new bitmap defaults to 96 DPI.
        /// </summary>
        private static Bitmap CopyToRgb24(Bitmap src)
        {
            var dst = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
            dst.SetResolution(src.HorizontalResolution, src.VerticalResolution);
            using (var g = Graphics.FromImage(dst))
            {
                g.InterpolationMode = InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode   = System.Drawing.Drawing2D.PixelOffsetMode.Half;
                g.DrawImage(src, 0, 0, src.Width, src.Height);
            }
            return dst;
        }

        private static string? FirstReasonableLinearSerial(Result? result)
        {
            if (result == null || string.IsNullOrEmpty(result.Text) || IsQrFormat(result.BarcodeFormat))
                return null;
            var t = result.Text.Trim();
            return LooksLikeSerialToken(t) ? t : null;
        }

        private static string? FirstReasonableLinearSerial(Result[]? results)
        {
            if (results == null) return null;
            foreach (var r in results)
            {
                if (string.IsNullOrEmpty(r.Text) || IsQrFormat(r.BarcodeFormat)) continue;
                var t = r.Text.Trim();
                if (LooksLikeSerialToken(t)) return t;
            }
            return null;
        }

        private static bool LooksLikeSerialToken(string t)
        {
            if (t.Length is < 1 or > 48) return false;
            var anyDigit = false;
            foreach (var c in t)
            {
                if (char.IsDigit(c)) anyDigit = true;
                else if (!char.IsLetter(c) && c is not ('_' or '-' or '.')) return false;
            }
            return anyDigit;
        }

        private static string? TryDecodeBottomStrip(Bitmap image, double frac, bool upsample, BarcodeReader reader)
        {
            try
            {
                int stripH = Math.Max(32, (int)(image.Height * frac));
                int y0 = Math.Max(0, image.Height - stripH);
                using var strip = image.Clone(new Rectangle(0, y0, image.Width, stripH), image.PixelFormat);
                Bitmap? upscaled = upsample ? UpsampleBicubic(strip, 2) : null;
                Bitmap work = upscaled ?? strip;
                try { return FirstValue(ZxRead(work, reader)) ?? FirstValue(ZxReadMultiple(work, reader)); }
                finally { upscaled?.Dispose(); }
            }
            catch { return null; }
        }

        private static Rectangle ZoneToRectangle(Bitmap bmp, TemplateBarcodeZone z) =>
            PageSerialZoneHelper.ZoneToRectanglePixels(bmp.Width, bmp.Height, z);

        /// <summary>Expands a rectangle by fixed padding on each side, clamped to <paramref name="bounds"/>.</summary>
        private static Rectangle InflateRectangleWithin(Rectangle r, int padX, int padY, Rectangle bounds)
        {
            var inflated = new Rectangle(r.X - padX, r.Y - padY, r.Width + 2 * padX, r.Height + 2 * padY);
            return Rectangle.Intersect(inflated, bounds);
        }

        /// <summary>Rectangle from (frac×W, frac×H) to bottom-right corner; captures barcodes slightly past the midlines.</summary>
        private static Rectangle BottomRightCornerRectangle(Bitmap image, double frac)
        {
            int w0 = image.Width, h0 = image.Height;
            int x = (int)Math.Floor(w0 * frac);
            int y = (int)Math.Floor(h0 * frac);
            x = Math.Clamp(x, 0, Math.Max(0, w0 - 8));
            y = Math.Clamp(y, 0, Math.Max(0, h0 - 8));
            int rw = Math.Max(8, w0 - x);
            int rh = Math.Max(8, h0 - y);
            return new Rectangle(x, y, rw, rh);
        }

        /// <summary>
        /// Upscales using high-quality bicubic interpolation which produces
        /// smooth bar edges that ZXing's binariser handles far better than the
        /// blocky artifacts from nearest-neighbor.
        /// </summary>
        private static Bitmap UpsampleBicubic(Bitmap src, int scale)
        {
            int nw = Math.Min(src.Width * scale, 8000);
            int nh = Math.Min(src.Height * scale, 8000);
            var dst = new Bitmap(nw, nh, PixelFormat.Format24bppRgb);
            dst.SetResolution(src.HorizontalResolution, src.VerticalResolution);
            using var g = Graphics.FromImage(dst);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode   = PixelOffsetMode.HighQuality;
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
