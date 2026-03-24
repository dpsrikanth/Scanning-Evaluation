using System.Drawing;
using System.Drawing.Imaging;
using PdfSharpCore.Drawing;
using PdfSharpCore.Pdf;

namespace ScannerApp.Services
{
    /// <summary>
    /// Converts a list of scanned JPEG images into a single compressed PDF booklet.
    /// Each image occupies one A4 page, fitted to the page while preserving aspect ratio.
    /// </summary>
    public static class PdfService
    {
        private const double A4WidthMm  = 210.0;
        private const double A4HeightMm = 297.0;

        /// <summary>
        /// Controls how aggressively images are compressed when building the PDF.
        /// The saved JPEG page files are left untouched — only the PDF copy is affected.
        /// </summary>
        /// <param name="JpegQuality">
        /// JPEG re-encode quality written into the PDF (1–100).
        /// 70 is a good balance: ~40 % smaller than the 85 % archival copy.
        /// </param>
        /// <param name="MaxDpi">
        /// Images scanned above this DPI are downscaled before embedding.
        /// 150 DPI is sufficient for on-screen reading; 0 disables downscaling.
        /// Downscaling 300→150 DPI alone saves ~75 % of image data.
        /// </param>
        public record CompressionOptions(int JpegQuality = 70, int MaxDpi = 150);

        /// <summary>
        /// Creates a compressed PDF at <paramref name="outputPath"/> from the supplied image files.
        /// Missing or unreadable files are silently skipped.
        /// </summary>
        public static void CreateBookletPdf(
            string outputPath,
            IList<string> imagePaths,
            CompressionOptions? options = null)
        {
            options ??= new CompressionOptions();

            using var document = new PdfDocument();
            document.Info.Creator = "Scanner Station";
            document.Options.CompressContentStreams = true; // deflate-compress page content streams

            var jpegEncoder  = GetJpegEncoder();
            var encoderParams = BuildEncoderParams(Math.Clamp(options.JpegQuality, 1, 100));

            foreach (var imgPath in imagePaths)
            {
                if (!File.Exists(imgPath)) continue;
                try
                {
                    EmbedPage(document, imgPath, options, jpegEncoder, encoderParams);
                }
                catch { /* skip unreadable images */ }
            }

            if (document.PageCount > 0)
                document.Save(outputPath);
        }

        // ── Private helpers ──────────────────────────────────────────────────

        private static void EmbedPage(
            PdfDocument document,
            string imgPath,
            CompressionOptions options,
            ImageCodecInfo? jpegEncoder,
            EncoderParameters encoderParams)
        {
            // Load the original scan
            using var original = new Bitmap(imgPath);

            // Determine the effective DPI of the scanned image
            float srcDpiX = original.HorizontalResolution > 0 ? original.HorizontalResolution : 300f;
            float srcDpiY = original.VerticalResolution   > 0 ? original.VerticalResolution   : 300f;

            // Calculate target dimensions after optional downscaling
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

            // Re-encode as JPEG at the target quality into a MemoryStream.
            // If no downscaling is needed and the source is already a JPEG we
            // could skip re-encoding, but quality control requires we always go
            // through the encoder here.
            using var ms = new MemoryStream();

            if (targetW == original.Width && targetH == original.Height)
            {
                // Same size — re-encode at target quality directly
                if (jpegEncoder != null)
                    original.Save(ms, jpegEncoder, encoderParams);
                else
                    original.Save(ms, ImageFormat.Jpeg);
            }
            else
            {
                // Downscale with high-quality bicubic interpolation, then encode
                using var scaled = new Bitmap(targetW, targetH);
                using (var g = Graphics.FromImage(scaled))
                {
                    g.InterpolationMode  = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g.PixelOffsetMode    = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                    g.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
                    g.DrawImage(original, 0, 0, targetW, targetH);
                }

                if (jpegEncoder != null)
                    scaled.Save(ms, jpegEncoder, encoderParams);
                else
                    scaled.Save(ms, ImageFormat.Jpeg);
            }

            ms.Position = 0;

            // Build the PDF page sized to A4
            var page   = document.AddPage();
            page.Width  = XUnit.FromMillimeter(A4WidthMm);
            page.Height = XUnit.FromMillimeter(A4HeightMm);

            using var gfx = XGraphics.FromPdfPage(page);

            // XImage.FromStream needs the stream to remain open for PdfSharpCore to read it.
            // We keep 'ms' alive for the duration of the gfx.DrawImage call.
            var img = XImage.FromStream(() => ms);
            using (img)
            {
                double pageW  = page.Width.Point;
                double pageH  = page.Height.Point;
                double scale  = Math.Min(pageW / img.PixelWidth, pageH / img.PixelHeight);
                double dw     = img.PixelWidth  * scale;
                double dh     = img.PixelHeight * scale;
                double x      = (pageW - dw) / 2.0;
                double y      = (pageH - dh) / 2.0;
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
