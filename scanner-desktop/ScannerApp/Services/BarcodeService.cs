using System.Drawing;
using ZXing;
using ZXing.Common;
using ZXing.Windows.Compatibility;

namespace ScannerApp.Services
{
    public class BarcodeService
    {
        private readonly BarcodeReader _reader;

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
        }

        public string? ReadBarcode(Bitmap image)
        {
            var result = _reader.Decode(image);
            return result?.Text;
        }

        /// <summary>
        /// Decodes a barcode from the bottom strip of the page (OMR page numbers are often printed there).
        /// <paramref name="bottomHeightFraction"/> is the share of total height taken from the bottom (e.g. 0.22 = bottom 22%).
        /// </summary>
        public string? ReadBarcodeFromBottom(Bitmap image, double bottomHeightFraction = 0.22)
        {
            if (image == null || image.Width < 16 || image.Height < 16)
                return null;

            double f = Math.Clamp(bottomHeightFraction, 0.08, 0.5);
            int stripH = Math.Max(12, (int)(image.Height * f));
            int y0 = image.Height - stripH;
            var rect = new Rectangle(0, y0, image.Width, stripH);
            try
            {
                using Bitmap strip = image.Clone(rect, image.PixelFormat);
                return ReadBarcode(strip);
            }
            catch
            {
                return null;
            }
        }

        public string? ReadBarcodeFromFile(string imagePath)
        {
            using var bitmap = new Bitmap(imagePath);
            return ReadBarcode(bitmap);
        }

        public List<string> ReadAllBarcodes(Bitmap image)
        {
            var results = _reader.DecodeMultiple(image);
            return results?.Select(r => r.Text).ToList() ?? new List<string>();
        }

        /// <summary>Returns all barcodes/QR codes with format and text.</summary>
        public List<(string Format, string Text)> ReadAllBarcodesDetailed(Bitmap image)
        {
            var results = _reader.DecodeMultiple(image);
            if (results == null || results.Length == 0) return new List<(string, string)>();
            return results
                .Where(r => !string.IsNullOrEmpty(r?.Text))
                .Select(r => (r!.BarcodeFormat.ToString(), r.Text!))
                .ToList();
        }
    }
}
