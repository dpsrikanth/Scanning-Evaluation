using System.Drawing;
using System.Drawing.Imaging;
using AForge.Imaging;
using AForge.Imaging.Filters;

namespace ScannerApp.Utils
{
    public static class ImageHelper
    {
        // ── Save ─────────────────────────────────────────────────────────────

        public static void SaveAsJpeg(Bitmap bitmap, string outputPath, int quality = 85)
        {
            if (bitmap.Width < 1 || bitmap.Height < 1)
                throw new ArgumentException("Bitmap has no valid dimensions for JPEG.", nameof(bitmap));

            var encoder = GetEncoder(ImageFormat.Jpeg);
            if (encoder == null)
            {
                bitmap.Save(outputPath, ImageFormat.Jpeg);
                return;
            }

            var encoderParams = new EncoderParameters(1);
            encoderParams.Param[0] = new EncoderParameter(Encoder.Quality, (long)quality);
            bitmap.Save(outputPath, encoder, encoderParams);
        }

        // ── Auto-trim + deskew ────────────────────────────────────────────────

        /// <summary>
        /// Optionally corrects skew and then crops to the tightest bounding box
        /// of non-white content.  When <paramref name="deskew"/> is false only the
        /// crop step runs, which still removes dark scanner borders.
        /// </summary>
        public static Bitmap AutoTrimAndDeskew(Bitmap src, bool deskew)
        {
            if (src.Width < 4 || src.Height < 4)
                return (Bitmap)src.Clone();

            // AForge requires 24bpp RGB as input for most filters
            Bitmap rgb = EnsureRgb24(src);

            if (deskew)
            {
                try
                {
                    Bitmap? openCv = OpenCvImagePreprocessor.TryDeskewAndCrop(rgb);
                    if (openCv != null)
                    {
                        if (!ReferenceEquals(rgb, src)) rgb.Dispose();
                        rgb = openCv;
                    }
                    else
                    {
                        // Build an 8bpp grayscale copy for the skew detector
                        Bitmap gray = Grayscale.CommonAlgorithms.BT709.Apply(rgb);

                        var checker = new DocumentSkewChecker();
                        double angle = checker.GetSkewAngle(gray);
                        gray.Dispose();

                        // Only rotate when the detected angle is significant
                        if (Math.Abs(angle) > 0.3 && Math.Abs(angle) < 45.0)
                        {
                            var rotateFilter = new RotateBilinear(-angle, keepSize: false)
                            {
                                FillColor = Color.White,
                            };
                            Bitmap rotated = rotateFilter.Apply(rgb);
                            if (!ReferenceEquals(rgb, src)) rgb.Dispose();
                            rgb = rotated;
                        }
                    }
                }
                catch
                {
                    // Deskew is best-effort; proceed with unrotated image on any error
                }
            }

            // OpenCV / PNG round-trip often yields 32bpp; CropToContent locks as 24bpp — would throw
            // "Parameter is not valid" without this step (see scanner activity log).
            rgb = CoerceToRgb24ForLockBits(rgb, src);

            Bitmap cropped = CropToContent(rgb);
            Bitmap trimmed = TrimBottomWhiteMargin(cropped);

            // Never dispose `cropped` when it is the caller's `src` — they still own that bitmap.
            if (!ReferenceEquals(trimmed, cropped) && !ReferenceEquals(cropped, src))
                cropped.Dispose();

            // If CropToContent returned the same object as `rgb`, disposing `rgb` here would invalidate
            // `cropped` before TrimBottomWhiteMargin (scanner log: "Parameter is not valid" on Width).
            bool rgbDisposedViaCropped =
                !ReferenceEquals(trimmed, cropped)
                && ReferenceEquals(cropped, rgb)
                && !ReferenceEquals(cropped, src);

            if (!ReferenceEquals(rgb, src) && !ReferenceEquals(trimmed, rgb) && !rgbDisposedViaCropped)
                rgb.Dispose();

            return trimmed;
        }

        /// <summary>
        /// Removes trailing scanner-bed white below the page footer (e.g. margin under the barcode row)
        /// by stripping rows from the bottom that are almost entirely white, allowing light noise/speckle.
        /// </summary>
        public static Bitmap TrimBottomWhiteMargin(Bitmap src)
        {
            const int PadBottomPx = 14;
            const double MaxTrimRatio = 0.12; // never remove more than 12% of the height

            bool ownRgb = false;
            Bitmap rgb = src;
            if (src.PixelFormat != PixelFormat.Format24bppRgb)
            {
                rgb = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
                using (var g = Graphics.FromImage(rgb))
                    g.DrawImage(src, 0, 0, src.Width, src.Height);
                ownRgb = true;
            }

            try
            {
                int w = rgb.Width;
                int h = rgb.Height;
                if (w < 8 || h < 8)
                {
                    if (ownRgb) return rgb;
                    return src;
                }

                var data = rgb.LockBits(
                    new Rectangle(0, 0, w, h),
                    ImageLockMode.ReadOnly,
                    PixelFormat.Format24bppRgb);
                int stride = data.Stride;
                int bottom = -1;

                int sideIgnore = Math.Max(12, w / 10);
                int xStart = sideIgnore;
                int xEnd = Math.Max(xStart + 1, w - sideIgnore);

                int minBottomY = (int)(h * (1.0 - MaxTrimRatio));

                unsafe
                {
                    byte* ptr = (byte*)data.Scan0;
                    int contentRun = 0;
                    for (int y = h - 1; y >= minBottomY; y--)
                    {
                        if (!IsEmptyScannerBedRow(ptr + y * stride, xStart, xEnd))
                        {
                            contentRun++;
                            if (contentRun >= 2)
                            {
                                bottom = Math.Min(h - 1, y + 1);
                                break;
                            }
                        }
                        else contentRun = 0;
                    }
                }

                rgb.UnlockBits(data);

                if (bottom < 0)
                {
                    if (ownRgb) return rgb;
                    return src;
                }

                int newH = Math.Min(h, bottom + 1 + PadBottomPx);
                if (newH >= h - 2)
                {
                    if (ownRgb) return rgb;
                    return src;
                }

                var rect = new Rectangle(0, 0, w, newH);
                var result = rgb.Clone(rect, PixelFormat.Format24bppRgb);
                if (ownRgb) rgb.Dispose();

                return result;
            }
            catch
            {
                if (ownRgb) rgb.Dispose();
                return src;
            }
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        public static string BuildPageFileName(string bookletId, int pageNumber, string format = "jpg")
        {
            return $"{bookletId}_Page_{pageNumber:D2}.{format}";
        }

        public static string BuildBookletFolder(string outputRoot, string bookletId)
        {
            var folder = Path.Combine(outputRoot, bookletId);
            Directory.CreateDirectory(folder);
            return folder;
        }

        // ── Private helpers ───────────────────────────────────────────────────

        /// <summary>
        /// Returns a 24bpp RGB copy of <paramref name="src"/>, or the original
        /// if it is already in the correct format.
        /// </summary>
        private static Bitmap EnsureRgb24(Bitmap src)
        {
            if (src.PixelFormat == PixelFormat.Format24bppRgb)
                return src;

            var dst = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
            using var g = Graphics.FromImage(dst);
            g.DrawImage(src, 0, 0, src.Width, src.Height);
            return dst;
        }

        /// <summary>
        /// Ensures <paramref name="rgb"/> is 24bpp for <see cref="CropToContent"/> / LockBits.
        /// Disposes <paramref name="rgb"/> when it allocated a conversion and rgb was not <paramref name="originalSrc"/>.
        /// </summary>
        private static Bitmap CoerceToRgb24ForLockBits(Bitmap rgb, Bitmap originalSrc)
        {
            if (rgb.PixelFormat == PixelFormat.Format24bppRgb)
                return rgb;
            if (rgb.Width < 2 || rgb.Height < 2)
                return rgb;

            var conv = new Bitmap(rgb.Width, rgb.Height, PixelFormat.Format24bppRgb);
            using (var g = Graphics.FromImage(conv))
            {
                g.DrawImage(rgb, 0, 0, rgb.Width, rgb.Height);
            }

            if (!ReferenceEquals(rgb, originalSrc))
                rgb.Dispose();
            return conv;
        }

        /// <summary>
        /// Scans from each edge inward to find the tightest bounding box that
        /// contains non-white pixels, then returns a cropped copy.
        /// Falls back to the original bitmap if no crop is needed or on error.
        /// </summary>
        private static Bitmap CropToContent(Bitmap src)
        {
            const int WhiteThreshold = 240;
            const int MarginPx       = 6;

            try
            {
                int w = src.Width;
                int h = src.Height;

                var data = src.LockBits(
                    new Rectangle(0, 0, w, h),
                    ImageLockMode.ReadOnly,
                    PixelFormat.Format24bppRgb);

                int stride = data.Stride;
                int top = 0, bottom = h - 1, left = 0, right = w - 1;

                unsafe
                {
                    byte* ptr = (byte*)data.Scan0;

                    for (int y = 0; y < h; y++)
                    {
                        if (!IsWhiteRow(ptr + y * stride, w, WhiteThreshold))
                        { top = y; break; }
                    }

                    for (int y = h - 1; y >= top; y--)
                    {
                        if (!IsWhiteRow(ptr + y * stride, w, WhiteThreshold))
                        { bottom = y; break; }
                    }

                    for (int x = 0; x < w; x++)
                    {
                        if (!IsWhiteCol(ptr, x, h, stride, WhiteThreshold))
                        { left = x; break; }
                    }

                    for (int x = w - 1; x >= left; x--)
                    {
                        if (!IsWhiteCol(ptr, x, h, stride, WhiteThreshold))
                        { right = x; break; }
                    }
                }

                src.UnlockBits(data);

                top    = Math.Max(0,     top    - MarginPx);
                left   = Math.Max(0,     left   - MarginPx);
                bottom = Math.Min(h - 1, bottom + MarginPx);
                right  = Math.Min(w - 1, right  + MarginPx);

                // Never crop more than 8% from top or bottom -- protects sparse handwriting
                int maxTopCrop    = (int)(h * 0.08);
                int maxBottomCrop = (int)(h * 0.08);
                if (top > maxTopCrop)    top    = maxTopCrop;
                if (bottom < h - 1 - maxBottomCrop) bottom = h - 1 - maxBottomCrop;

                int cropW = right  - left + 1;
                int cropH = bottom - top  + 1;

                if (cropW < 4 || cropH < 4 || left < 0 || top < 0 || left + cropW > w || top + cropH > h)
                    return src;

                if (cropW >= w * 0.99 && cropH >= h * 0.99)
                    return src;

                var rect = new Rectangle(left, top, cropW, cropH);
                return src.Clone(rect, PixelFormat.Format24bppRgb);
            }
            catch
            {
                return src;
            }
        }

        private static unsafe bool IsWhiteRow(byte* rowPtr, int width, int threshold)
        {
            long sumLum = 0;
            int dark = 0;
            int leftIgnore = Math.Max(6, width / 16); // skip edge rails/shadows
            int rightIgnore = width - leftIgnore;
            int span = Math.Max(1, rightIgnore - leftIgnore);
            for (int x = leftIgnore; x < rightIgnore; x++)
            {
                byte b = rowPtr[x * 3];
                byte g = rowPtr[x * 3 + 1];
                byte r = rowPtr[x * 3 + 2];
                int lum = (r + g + b) / 3;
                sumLum += lum;
                if (r < threshold || g < threshold || b < threshold)
                    dark++;
            }
            double meanLum = (double)sumLum / span;
            int maxDarkNoise = Math.Max(12, span / 95);
            return meanLum >= 244.0 && dark <= maxDarkNoise;
        }

        private static unsafe bool IsWhiteCol(byte* basePtr, int col, int height, int stride, int threshold)
        {
            long sumLum = 0;
            int dark = 0;
            int topIgnore = Math.Max(6, height / 20);     // avoid header/footer lines affecting side crop
            int bottomIgnore = Math.Max(topIgnore + 1, height - topIgnore);
            int span = Math.Max(1, bottomIgnore - topIgnore);
            for (int y = topIgnore; y < bottomIgnore; y++)
            {
                byte* px = basePtr + y * stride + col * 3;
                if (px[0] < threshold || px[1] < threshold || px[2] < threshold)
                    dark++;
                sumLum += (px[0] + px[1] + px[2]) / 3;
            }
            double meanLum = (double)sumLum / span;
            int maxDarkNoise = Math.Max(10, span / 90);
            return meanLum >= 244.0 && dark <= maxDarkNoise;
        }

        /// <summary>
        /// Scanner bed / appended white below the footer: very high mean brightness with only noise-level dark pixels.
        /// Per-pixel "near white" counts fail on JPEG (many channels 245–247); mean + ink count is robust.
        /// </summary>
        private static unsafe bool IsEmptyScannerBedRow(byte* rowPtr, int xStart, int xEnd)
        {
            long sumLum = 0;
            int dark = 0;
            int veryDark = 0;
            int span = Math.Max(1, xEnd - xStart);
            for (int x = xStart; x < xEnd; x++)
            {
                byte b = rowPtr[x * 3];
                byte g = rowPtr[x * 3 + 1];
                byte r = rowPtr[x * 3 + 2];
                int lum = (r + g + b) / 3;
                sumLum += lum;
                if (lum < 210) dark++;
                if (lum < 175) veryDark++;
            }

            double meanLum = (double)sumLum / span;
            double darkDensity = dark / (double)span;
            double veryDarkDensity = veryDark / (double)span;

            // Tighter thresholds: only consider truly blank scanner-bed rows as empty.
            // Sparse handwriting (light ink, few strokes) must survive this check.
            bool hasRealContent = meanLum < 246.0 || darkDensity > 0.005 || veryDarkDensity > 0.002;
            return !hasRealContent;
        }

        private static ImageCodecInfo? GetEncoder(ImageFormat format)
        {
            return ImageCodecInfo.GetImageEncoders()
                .FirstOrDefault(c => c.FormatID == format.Guid);
        }
    }
}
