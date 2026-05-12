using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace ScannerApp.Controls
{
    /// <summary>
    /// Draws the image scaled uniformly to <b>fit</b> inside the client (entire page visible, centered),
    /// like <see cref="PictureBoxSizeMode.Zoom"/> with a clean white surround. Optional overlay is in
    /// image pixel space mapped to the drawn rectangle.
    /// </summary>
    public sealed class FitPreviewControl : Control
    {
        private Image? _image;
        private Rectangle? _overlayInImagePixels;
        private bool _tintBarcodeError;

        public FitPreviewControl()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
            UpdateStyles();
            BackColor = Color.White;
        }

        /// <summary>Assigned image is displayed; caller disposes the previous image before replacing.</summary>
        public Image? PreviewImage
        {
            get => _image;
            set
            {
                _image = value;
                Invalidate();
            }
        }

        /// <summary>Highlight in the same pixel space as <see cref="PreviewImage"/> (e.g. decoded page JPEG).</summary>
        public void SetBarcodeOverlay(Rectangle? overlayInImagePixels)
        {
            _overlayInImagePixels = overlayInImagePixels;
            Invalidate();
        }

        /// <summary>Light red wash when barcode failed on the visible page (sheet still shown).</summary>
        public bool TintBarcodeError
        {
            get => _tintBarcodeError;
            set
            {
                if (_tintBarcodeError == value) return;
                _tintBarcodeError = value;
                Invalidate();
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(BackColor);

            if (_image == null)
                return;

            var dest = ComputeFitDestRect(ClientSize, _image.Size);
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.Half;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.DrawImage(_image, RoundRect(dest));

            if (_overlayInImagePixels is { } ov && ov.Width > 1 && ov.Height > 1)
            {
                var clientOv = MapImageRectToClient(ov, dest, _image.Size);
                if (clientOv.Width > 1 && clientOv.Height > 1)
                {
                    float penW = Math.Max(2f, Math.Min(ClientSize.Width, ClientSize.Height) / 280f);
                    using var pen = new Pen(Color.FromArgb(0, 200, 90), penW);
                    pen.Alignment = PenAlignment.Center;
                    g.DrawRectangle(pen, clientOv.X, clientOv.Y, clientOv.Width, clientOv.Height);
                }
            }

            if (_tintBarcodeError)
            {
                using var b = new SolidBrush(Color.FromArgb(72, 254, 202, 202));
                g.FillRectangle(b, ClientRectangle);
            }

            using var edge = new Pen(Color.FromArgb(200, 210, 220), 1f);
            var br = ClientRectangle;
            br.Width -= 1;
            br.Height -= 1;
            if (br.Width > 0 && br.Height > 0)
                g.DrawRectangle(edge, br);
        }

        private static Rectangle RoundRect(RectangleF r) =>
            Rectangle.FromLTRB((int)Math.Round(r.Left), (int)Math.Round(r.Top),
                (int)Math.Round(r.Right), (int)Math.Round(r.Bottom));

        /// <summary>Uniform scale so the entire image fits inside the client; centered (letterbox/pillarbox).</summary>
        public static RectangleF ComputeFitDestRect(Size client, Size img)
        {
            if (img.Width < 1 || img.Height < 1 || client.Width < 1 || client.Height < 1)
                return new RectangleF(0, 0, client.Width, client.Height);

            float s = Math.Min(client.Width / (float)img.Width, client.Height / (float)img.Height);
            float w = img.Width * s;
            float h = img.Height * s;
            float x = (client.Width - w) / 2f;
            float y = (client.Height - h) / 2f;
            return new RectangleF(x, y, w, h);
        }

        public static Rectangle MapImageRectToClient(Rectangle imgRect, RectangleF dest, Size imgSize)
        {
            float sx = dest.Width / imgSize.Width;
            float sy = dest.Height / imgSize.Height;
            var r = new RectangleF(
                dest.X + imgRect.X * sx,
                dest.Y + imgRect.Y * sy,
                imgRect.Width * sx,
                imgRect.Height * sy);
            return Rectangle.FromLTRB(
                (int)Math.Floor(r.Left),
                (int)Math.Floor(r.Top),
                (int)Math.Ceiling(r.Right),
                (int)Math.Ceiling(r.Bottom));
        }
    }
}
