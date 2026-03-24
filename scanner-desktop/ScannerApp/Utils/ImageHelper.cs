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
            return cropped;
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

        private static ImageCodecInfo? GetEncoder(ImageFormat format)
        {
            return ImageCodecInfo.GetImageEncoders()
                .FirstOrDefault(c => c.FormatID == format.Guid);
        }
    }
}
