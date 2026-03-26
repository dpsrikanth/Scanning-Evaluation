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

            Bitmap cropped = CropToContent(rgb);
            if (!ReferenceEquals(rgb, src)) rgb.Dispose();

            Bitmap trimmed = TrimBottomWhiteMargin(cropped);
            if (!ReferenceEquals(trimmed, cropped)) cropped.Dispose();
            return trimmed;
        }

        /// <summary>
        /// Removes trailing scanner-bed white below the page footer (e.g. margin under the barcode row)
        /// by stripping rows from the bottom that are almost entirely white, allowing light noise/speckle.
        /// </summary>
        public static Bitmap TrimBottomWhiteMargin(Bitmap src)
        {
            const int PadBottomPx = 4;

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

                unsafe
                {
                    byte* ptr = (byte*)data.Scan0;
                    for (int y = h - 1; y >= 0; y--)
                    {
                        if (!IsEmptyScannerBedRow(ptr + y * stride, w))
                        {
                            bottom = y;
                            break;
                        }
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

                // Second pass: noise can leave a thin band after the first crop (do not use `using` — we return `second`).
                Bitmap second = TrimBottomWhiteMarginOnce(result, PadBottomPx);
                if (!ReferenceEquals(second, result))
                {
                    result.Dispose();
                    return second;
                }

                return result;
            }
            catch
            {
                if (ownRgb) rgb.Dispose();
                return src;
            }
        }

        /// <summary>Single trim pass (used internally; avoids recursion on second pass).</summary>
        private static Bitmap TrimBottomWhiteMarginOnce(Bitmap rgb, int padBottomPx)
        {
            int w = rgb.Width;
            int h = rgb.Height;
            var data = rgb.LockBits(
                new Rectangle(0, 0, w, h),
                ImageLockMode.ReadOnly,
                PixelFormat.Format24bppRgb);
            int stride = data.Stride;
            int bottom = -1;
            unsafe
            {
                byte* ptr = (byte*)data.Scan0;
                for (int y = h - 1; y >= 0; y--)
                {
                    if (!IsEmptyScannerBedRow(ptr + y * stride, w))
                    {
                        bottom = y;
                        break;
                    }
                }
            }

            rgb.UnlockBits(data);

            if (bottom < 0)
                return rgb;

            int newH = Math.Min(h, bottom + 1 + padBottomPx);
            if (newH >= h - 2)
                return rgb;

            return rgb.Clone(new Rectangle(0, 0, w, newH), PixelFormat.Format24bppRgb);
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
        /// Scans from each edge inward to find the tightest bounding box that
        /// contains non-white pixels, then returns a cropped copy.
        /// Falls back to the original bitmap if no crop is needed or on error.
        /// </summary>
        private static Bitmap CropToContent(Bitmap src)
        {
            const int WhiteThreshold = 240; // pixel channel value considered "white"
            const int MarginPx       = 4;   // leave a few pixels of padding

            try
            {
                int w = src.Width;
                int h = src.Height;

                // Lock bits for fast pixel access
                var data = src.LockBits(
                    new Rectangle(0, 0, w, h),
                    ImageLockMode.ReadOnly,
                    PixelFormat.Format24bppRgb);

                int stride = data.Stride;
                int top = 0, bottom = h - 1, left = 0, right = w - 1;

                unsafe
                {
                    byte* ptr = (byte*)data.Scan0;

                    // Scan top edge down
                    for (int y = 0; y < h; y++)
                    {
                        if (!IsWhiteRow(ptr + y * stride, w, WhiteThreshold))
                        { top = y; break; }
                    }

                    // Scan bottom edge up
                    for (int y = h - 1; y >= top; y--)
                    {
                        if (!IsWhiteRow(ptr + y * stride, w, WhiteThreshold))
                        { bottom = y; break; }
                    }

                    // Scan left edge right
                    for (int x = 0; x < w; x++)
                    {
                        if (!IsWhiteCol(ptr, x, h, stride, WhiteThreshold))
                        { left = x; break; }
                    }

                    // Scan right edge left
                    for (int x = w - 1; x >= left; x--)
                    {
                        if (!IsWhiteCol(ptr, x, h, stride, WhiteThreshold))
                        { right = x; break; }
                    }
                }

                src.UnlockBits(data);

                // Add margin and clamp
                top    = Math.Max(0,     top    - MarginPx);
                left   = Math.Max(0,     left   - MarginPx);
                bottom = Math.Min(h - 1, bottom + MarginPx);
                right  = Math.Min(w - 1, right  + MarginPx);

                int cropW = right  - left + 1;
                int cropH = bottom - top  + 1;

                // If the crop removes less than 1% in every direction, don't bother
                if (cropW >= w * 0.99 && cropH >= h * 0.99)
                    return src;

                var rect = new Rectangle(left, top, cropW, cropH);
                return src.Clone(rect, src.PixelFormat);
            }
            catch
            {
                return src;
            }
        }

        private static unsafe bool IsWhiteRow(byte* rowPtr, int width, int threshold)
        {
            for (int x = 0; x < width; x++)
            {
                byte b = rowPtr[x * 3];
                byte g = rowPtr[x * 3 + 1];
                byte r = rowPtr[x * 3 + 2];
                if (r < threshold || g < threshold || b < threshold)
                    return false;
            }
            return true;
        }

        private static unsafe bool IsWhiteCol(byte* basePtr, int col, int height, int stride, int threshold)
        {
            for (int y = 0; y < height; y++)
            {
                byte* px = basePtr + y * stride + col * 3;
                if (px[0] < threshold || px[1] < threshold || px[2] < threshold)
                    return false;
            }
            return true;
        }

        /// <summary>
        /// Scanner bed / appended white below the footer: very high mean brightness with only noise-level dark pixels.
        /// Per-pixel "near white" counts fail on JPEG (many channels 245–247); mean + ink count is robust.
        /// </summary>
        private static unsafe bool IsEmptyScannerBedRow(byte* rowPtr, int width)
        {
            long sumLum = 0;
            int ink = 0;
            for (int x = 0; x < width; x++)
            {
                byte b = rowPtr[x * 3];
                byte g = rowPtr[x * 3 + 1];
                byte r = rowPtr[x * 3 + 2];
                int lum = (r + g + b) / 3;
                int m = r < g ? (r < b ? r : b) : (g < b ? g : b);
                sumLum += lum;
                if (m < 175)
                    ink++;
            }

            double meanLum = (double)sumLum / width;
            // Footer/barcode/text rows: lower mean and/or many dark modules.
            int maxInkNoise = Math.Max(96, width / 22);
            return meanLum >= 246.5 && ink <= maxInkNoise;
        }

        private static ImageCodecInfo? GetEncoder(ImageFormat format)
        {
            return ImageCodecInfo.GetImageEncoders()
                .FirstOrDefault(c => c.FormatID == format.Guid);
        }
    }
}
