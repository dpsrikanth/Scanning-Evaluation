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

                const int pad = 8;
                Bitmap full = MatToBitmap(rotated);
                if (best.Width <= 0 || best.Height <= 0)
                    return full;

                best = Rectangle.Intersect(
                    new Rectangle(0, 0, full.Width, full.Height),
                    new Rectangle(
                        Math.Max(0, best.X - pad),
                        Math.Max(0, best.Y - pad),
                        Math.Min(full.Width - Math.Max(0, best.X - pad), best.Width + 2 * pad),
                        Math.Min(full.Height - Math.Max(0, best.Y - pad), best.Height + 2 * pad)));

                if (best.Width < 40 || best.Height < 40)
                    return full;

                Bitmap cropped = full.Clone(best, full.PixelFormat);
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

        private static Mat BitmapToMatBgr(Bitmap bmp)
        {
            using var ms = new MemoryStream();
            bmp.Save(ms, ImageFormat.Png);
            byte[] data = ms.ToArray();
            Mat mat = new Mat();
            CvInvoke.Imdecode(data, ImreadModes.Color, mat);
            return mat;
        }

        private static Bitmap MatToBitmap(Mat mat)
        {
            byte[] buf = CvInvoke.Imencode(".png", mat) ?? Array.Empty<byte>();
            using var ms = new MemoryStream(buf);
            return new Bitmap(ms);
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
