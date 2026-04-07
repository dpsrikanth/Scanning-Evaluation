using System.Drawing;
using System.Drawing.Imaging;
using Emgu.CV;
using Emgu.CV.CvEnum;
using Emgu.CV.Structure;
using Emgu.CV.Util;

namespace ScannerApp.Utils
{
    /// <summary>
    /// Document deskew (Hough line angles on binarized edges) + largest-contour crop via Emgu CV.
    /// Used when template <see cref="Models.ScanTemplate.DeSkew"/> is enabled; falls back to AForge on failure.
    /// </summary>
    public static class OpenCvImagePreprocessor
    {
        public static Bitmap? TryDeskewAndCrop(Bitmap src)
        {
            Mat? bgr = null;
            Mat? gray = null;
            Mat? blur = null;
            Mat? bin = null;
            Mat? rotated = null;
            Mat? mRot = null;
            Mat? gray2 = null;
            Mat? bw = null;
            Mat? hi = null;

            try
            {
                using Bitmap rgb = EnsureRgb24(src);
                bgr = BitmapToMatBgr(rgb);

                gray = new Mat();
                CvInvoke.CvtColor(bgr, gray, ColorConversion.Bgr2Gray);

                blur = new Mat();
                CvInvoke.GaussianBlur(gray, blur, new Size(3, 3), 0);

                bin = new Mat();
                CvInvoke.Threshold(blur, bin, 0, 255, ThresholdType.Binary | ThresholdType.Otsu);

                double skewDeg = EstimateSkewDegFromBinary(bin);
                if (Math.Abs(skewDeg) > 0.1 && Math.Abs(skewDeg) < 10)
                {
                    PointF center = new PointF(bgr.Cols / 2f, bgr.Rows / 2f);
                    mRot = new Mat();
                    CvInvoke.GetRotationMatrix2D(center, skewDeg, 1.0, mRot);
                    rotated = new Mat();
                    CvInvoke.WarpAffine(
                        bgr,
                        rotated,
                        mRot,
                        bgr.Size,
                        Inter.Linear,
                        Warp.Default,
                        BorderType.Constant,
                        new MCvScalar(255, 255, 255));
                }
                else
                {
                    rotated = bgr.Clone();
                }

                // Convert rotated image to grayscale for document boundary detection.
                // Use a fixed threshold of 160 to isolate actual dark ink/borders only.
                // BinaryInv+Otsu was unreliable: gray scanner-bed pixels (~180-210) fell
                // below the Otsu threshold and were classified as foreground together with
                // real ink, causing the largest contour to span the entire image with no
                // useful crop boundary.
                gray2 = new Mat();
                CvInvoke.CvtColor(rotated, gray2, ColorConversion.Bgr2Gray);
                CvInvoke.GaussianBlur(gray2, gray2, new Size(3, 3), 0);
                bw = new Mat();
                CvInvoke.Threshold(gray2, bw, 160, 255, ThresholdType.BinaryInv);

                hi = new Mat();
                using var contours = new VectorOfVectorOfPoint();
                CvInvoke.FindContours(bw, contours, hi, RetrType.External, ChainApproxMethod.ChainApproxSimple);

                double maxArea = 0;
                Rectangle best = Rectangle.Empty;
                double minArea = bw.Width * (double)bw.Height * 0.05;
                for (int i = 0; i < contours.Size; i++)
                {
                    Rectangle r = CvInvoke.BoundingRectangle(contours[i]);
                    double a = r.Width * (double)r.Height;
                    if (a > maxArea && a >= minArea)
                    {
                        maxArea = a;
                        best = r;
                    }
                }

                const int pad = 10;
                Bitmap full = MatToBitmapBgr24(rotated);
                if (best.Width <= 0 || best.Height <= 0)
                    return full;

                int x0 = Math.Max(0, best.X - pad);
                int y0 = Math.Max(0, best.Y - pad);
                int maxW = Math.Max(1, full.Width - x0);
                int maxH = Math.Max(1, full.Height - y0);
                int rw = Math.Clamp(best.Width + 2 * pad, 1, maxW);
                int rh = Math.Clamp(best.Height + 2 * pad, 1, maxH);
                best = Rectangle.Intersect(
                    new Rectangle(0, 0, full.Width, full.Height),
                    new Rectangle(x0, y0, rw, rh));

                if (best.Width < 40 || best.Height < 40 || best.Width < 1 || best.Height < 1)
                    return full;

                // Never crop more than 15% of the height or width -- protects
                // sparse handwritten content that the contour detector may miss.
                int minW = (int)(full.Width  * 0.85);
                int minH = (int)(full.Height * 0.85);
                if (best.Width < minW || best.Height < minH)
                    return full;

                Bitmap cropped = full.Clone(best, PixelFormat.Format24bppRgb);
                full.Dispose();
                return cropped;
            }
            catch
            {
                return null;
            }
            finally
            {
                bgr?.Dispose();
                gray?.Dispose();
                blur?.Dispose();
                bin?.Dispose();
                rotated?.Dispose();
                mRot?.Dispose();
                gray2?.Dispose();
                bw?.Dispose();
                hi?.Dispose();
            }
        }

        private static double EstimateSkewDegFromBinary(Mat bin)
        {
            using Mat edges = new Mat();
            CvInvoke.Canny(bin, edges, 50, 150, 3, false);

            LineSegment2D[] segs = CvInvoke.HoughLinesP(
                edges,
                1,
                Math.PI / 180,
                40,   // vote threshold
                40,   // min line length — filters out short segments from registration-mark edges
                10);

            List<double> angles = new List<double>();
            foreach (var seg in segs)
            {
                double dx = seg.P2.X - seg.P1.X;
                double dy = seg.P2.Y - seg.P1.Y;
                if (Math.Abs(dx) < 1e-6 && Math.Abs(dy) < 1e-6)
                    continue;
                double deg = Math.Atan2(dy, dx) * 180.0 / Math.PI;
                while (deg <= -90) deg += 180;
                while (deg > 90) deg -= 180;
                // Only near-horizontal lines are relevant for document skew.
                // Registration marks produce diagonal ~45° segments — exclude them.
                if (Math.Abs(deg) <= 5.0)
                    angles.Add(deg);
            }

            if (angles.Count < 2)
                return 0;

            angles.Sort();
            return angles[angles.Count / 2];
        }

        /// <summary>LockBits copy — avoids PNG encode/decode on every page (major scan throughput win).</summary>
        private static Mat BitmapToMatBgr(Bitmap bmp)
        {
            if (bmp.PixelFormat != PixelFormat.Format24bppRgb)
                throw new InvalidOperationException("BitmapToMatBgr expects 24bpp RGB (call EnsureRgb24 first).");

            var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
            var bd = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            try
            {
                var mat = new Mat(bmp.Height, bmp.Width, DepthType.Cv8U, 3);
                nuint srcStride = (nuint)bd.Stride;
                nuint dstStep = (nuint)mat.Step;
                int w = bmp.Width;
                int h = bmp.Height;
                nuint rowBytes = (nuint)(w * 3);
                unsafe
                {
                    byte* srcBase = (byte*)bd.Scan0;
                    byte* dstBase = (byte*)mat.DataPointer;
                    for (int y = 0; y < h; y++)
                    {
                        Buffer.MemoryCopy(
                            srcBase + (nuint)y * srcStride,
                            dstBase + (nuint)y * dstStep,
                            rowBytes,
                            rowBytes);
                    }
                }

                return mat;
            }
            finally
            {
                bmp.UnlockBits(bd);
            }
        }

        private static Bitmap MatToBitmapBgr24(Mat mat)
        {
            if (mat.IsEmpty || mat.Width < 1 || mat.Height < 1)
                throw new ArgumentException("Invalid mat for bitmap conversion.");

            int w = mat.Width;
            int h = mat.Height;
            var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb);
            var rect = new Rectangle(0, 0, w, h);
            var bd = bmp.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
            try
            {
                nuint dstStride = (nuint)bd.Stride;
                nuint srcStep = (nuint)mat.Step;
                nuint rowBytes = (nuint)(w * 3);
                unsafe
                {
                    byte* dstBase = (byte*)bd.Scan0;
                    byte* srcBase = (byte*)mat.DataPointer;
                    for (int y = 0; y < h; y++)
                    {
                        Buffer.MemoryCopy(
                            srcBase + (nuint)y * srcStep,
                            dstBase + (nuint)y * dstStride,
                            rowBytes,
                            rowBytes);
                    }
                }
            }
            finally
            {
                bmp.UnlockBits(bd);
            }

            return bmp;
        }

        private static Bitmap EnsureRgb24(Bitmap src)
        {
            if (src.PixelFormat == PixelFormat.Format24bppRgb)
                return (Bitmap)src.Clone();

            var dst = new Bitmap(src.Width, src.Height, PixelFormat.Format24bppRgb);
            using var g = Graphics.FromImage(dst);
            g.DrawImage(src, 0, 0, src.Width, src.Height);
            return dst;
        }
    }
}
