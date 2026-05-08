using System.Drawing;
using System.Drawing.Imaging;
using PdfSharp.Drawing;
using PdfSharp.Pdf;
using ScannerApp.Utils;

namespace ScannerApp.Services
{
    /// <summary>
    /// Converts scanned JPEG images into a single PDF booklet (A4, aspect preserved).
    /// Uses PDFsharp-GDI (GDI+).
    /// </summary>
    public static class PdfService
    {
        private const double A4WidthMm  = 210.0;
        private const double A4HeightMm = 297.0;

        /// <summary>
        /// Controls JPEG re-encode for the PDF copy only (saved page files are unchanged).
        /// </summary>
        public record CompressionOptions(int JpegQuality = 70, int MaxDpi = 150);

        /// <summary>
        /// Creates a PDF at <paramref name="outputPath"/> from image file paths.
        /// </summary>
        public static void CreateBookletPdf(
            string outputPath,
            IList<string> imagePaths,
            CompressionOptions? options = null)
        {
            options ??= new CompressionOptions();

            using var document = new PdfDocument();
            document.Info.Creator = "Scanner Station";
            document.Options.FlateEncodeMode = PdfFlateEncodeMode.BestCompression;

            var jpegEncoder = GetJpegEncoder();
            using var encoderParams = BuildEncoderParams(Math.Clamp(options.JpegQuality, 1, 100));
            var tempFilesToDelete = new List<string>();

            try
            {
                foreach (var imgPath in imagePaths)
                {
                    if (!File.Exists(imgPath))
                    {
                        AppLogger.Warn($"PDF: skip missing file: {imgPath}");
                        continue;
                    }

                    try
                    {
                        EmbedPage(document, imgPath, options, jpegEncoder, encoderParams, tempFilesToDelete);
                    }
                    catch (Exception ex)
                    {
                        AppLogger.Error($"PDF: skip unreadable page {imgPath}: {ex.Message}", ex);
                    }
                }

                if (document.PageCount > 0)
                    document.Save(outputPath);
                else
                    AppLogger.Warn("PDF: no pages embedded — output not written.");
            }
            finally
            {
                foreach (var f in tempFilesToDelete)
                {
                    try
                    {
                        if (File.Exists(f))
                            File.Delete(f);
                    }
                    catch
                    {
                        /* ignore */
                    }
                }
            }
        }

        private static void EmbedPage(
            PdfDocument document,
            string imgPath,
            CompressionOptions options,
            ImageCodecInfo? jpegEncoder,
            EncoderParameters encoderParams,
            IList<string> tempFilesToDelete)
        {
            string embedPath;

            using (var original = new Bitmap(imgPath))
            {
                float srcDpiX = original.HorizontalResolution > 0 ? original.HorizontalResolution : 300f;
                float srcDpiY = original.VerticalResolution   > 0 ? original.VerticalResolution   : 300f;

                int targetW = original.Width;
                int targetH = original.Height;

                if (options.MaxDpi > 0 && (srcDpiX > options.MaxDpi || srcDpiY > options.MaxDpi))
                {
                    double scaleX = options.MaxDpi / (double)srcDpiX;
                    double scaleY = options.MaxDpi / (double)srcDpiY;
                    double scale  = Math.Min(scaleX, scaleY);
                    targetW = Math.Max(1, (int)(original.Width  * scale));
                    targetH = Math.Max(1, (int)(original.Height * scale));
                }

                if (targetW == original.Width && targetH == original.Height)
                {
                    embedPath = imgPath;
                }
                else
                {
                    embedPath = Path.Combine(Path.GetTempPath(), $"scanpdf_{Guid.NewGuid():N}.jpg");
                    tempFilesToDelete.Add(embedPath);

                    using var scaled = new Bitmap(targetW, targetH, PixelFormat.Format24bppRgb);
                    using (var g = Graphics.FromImage(scaled))
                    {
                        g.InterpolationMode  = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        g.PixelOffsetMode    = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                        g.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
                        g.DrawImage(original, 0, 0, targetW, targetH);
                    }

                    if (jpegEncoder != null)
                        scaled.Save(embedPath, jpegEncoder, encoderParams);
                    else
                        scaled.Save(embedPath, ImageFormat.Jpeg);
                }
            }

            int pxW, pxH;
            using (var probe = XImage.FromFile(embedPath))
            {
                pxW = probe.PixelWidth;
                pxH = probe.PixelHeight;
            }

            if (pxW <= 0 || pxH <= 0)
            {
                AppLogger.Warn($"PDF: invalid image dimensions for {embedPath} ({pxW}×{pxH}) — skipped.");
                return;
            }

            var page = document.AddPage();
            page.Width  = XUnit.FromMillimeter(A4WidthMm);
            page.Height = XUnit.FromMillimeter(A4HeightMm);

            using (var gfx = XGraphics.FromPdfPage(page))
            using (var img = XImage.FromFile(embedPath))
            {
                double pageW = page.Width.Point;
                double pageH = page.Height.Point;
                double scale = Math.Min(pageW / img.PixelWidth, pageH / img.PixelHeight);
                double dw    = img.PixelWidth  * scale;
                double dh    = img.PixelHeight * scale;
                double x     = (pageW - dw) / 2.0;
                double y     = (pageH - dh) / 2.0;
                gfx.DrawImage(img, x, y, dw, dh);
            }
        }

        private static ImageCodecInfo? GetJpegEncoder() =>
            ImageCodecInfo.GetImageEncoders()
                .FirstOrDefault(c => c.FormatID == ImageFormat.Jpeg.Guid);

        private static EncoderParameters BuildEncoderParams(int quality)
        {
            var p = new EncoderParameters(1);
            p.Param[0] = new EncoderParameter(Encoder.Quality, (long)quality);
            return p;
        }
    }
}
