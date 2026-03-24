using ScannerApp.Models;
using ScannerApp.Utils;

namespace ScannerApp.Forms
{
    /// <summary>
    /// Modal popup shown after a booklet is fully scanned.
    /// Displays barcode details decoded from page 1, a thumbnail of page 1,
    /// and offers "Save & Queue Upload" or "Discard" actions.
    /// </summary>
    public class ScanCompleteDialog : Form
    {
        private readonly BarcodeDetails _barcode;
        private readonly IList<System.Drawing.Bitmap> _pages;
        private readonly int _expectedPages;

        public bool SaveRequested  { get; private set; } = false;

        public ScanCompleteDialog(
            BarcodeDetails barcode,
            IList<System.Drawing.Bitmap> pages,
            int expectedPages)
        {
            _barcode       = barcode;
            _pages         = pages;
            _expectedPages = expectedPages;

            Text            = "Scan Complete — Booklet Details";
            Size            = new Size(640, 440);
            StartPosition   = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox     = false;
            MinimizeBox     = false;
            BackColor       = Color.FromArgb(245, 247, 250);

            BuildUI();
        }

        private void BuildUI()
        {
            // ── Left column: page-1 thumbnail ─────────────────────────────────
            var pic = new PictureBox
            {
                Location    = new Point(16, 16),
                Size        = new Size(200, 280),
                SizeMode    = PictureBoxSizeMode.Zoom,
                BorderStyle = BorderStyle.FixedSingle,
                BackColor   = Color.White,
            };

            if (_pages.Count > 0)
                pic.Image = _pages[0];

            // ── Right column: barcode details ─────────────────────────────────
            int rx = 232, ry = 16;

            var lblHead = new Label
            {
                Text      = "Barcode Details — Page 1",
                Font      = new Font("Segoe UI", 11, FontStyle.Bold),
                ForeColor = Color.FromArgb(13, 110, 74),
                Location  = new Point(rx, ry),
                AutoSize  = true,
            };
            ry += 36;

            var fields = new (string Label, string Value)[]
            {
                ("Exam Code",  _barcode.ExamCode),
                ("Paper Code", _barcode.PaperCode),
                ("Roll No",    _barcode.RollNo),
                ("Serial",     _barcode.Serial),
                ("Raw Value",  _barcode.RawValue),
            };

            var detailControls = new List<Control> { lblHead };

            foreach (var (label, value) in fields)
            {
                var lbl = new Label
                {
                    Text      = label + ":",
                    Font      = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                    ForeColor = Color.FromArgb(90, 100, 115),
                    Location  = new Point(rx, ry),
                    AutoSize  = true,
                };
                var val = new Label
                {
                    Text      = string.IsNullOrWhiteSpace(value) ? "—" : value,
                    Font      = new Font("Consolas", 9),
                    ForeColor = Color.FromArgb(20, 30, 50),
                    Location  = new Point(rx + 90, ry),
                    AutoSize  = true,
                };
                detailControls.Add(lbl);
                detailControls.Add(val);
                ry += 28;
            }

            ry += 10;

            // Page count with mismatch warning
            bool mismatch = _pages.Count != _expectedPages;
            var lblPages  = new Label
            {
                Text      = $"Pages scanned: {_pages.Count} / expected: {_expectedPages}",
                Font      = new Font("Segoe UI", 9, mismatch ? FontStyle.Bold : FontStyle.Regular),
                ForeColor = mismatch ? Color.FromArgb(180, 30, 30) : Color.FromArgb(13, 110, 74),
                Location  = new Point(rx, ry),
                AutoSize  = true,
            };
            detailControls.Add(lblPages);
            ry += 30;

            // Filename preview
            var lblFileName = new Label
            {
                Text      = $"File name: {_barcode.ToFilename()}",
                Font      = new Font("Consolas", 8.5f),
                ForeColor = Color.FromArgb(70, 80, 100),
                Location  = new Point(rx, ry),
                AutoSize  = true,
            };
            detailControls.Add(lblFileName);

            // ── Buttons ───────────────────────────────────────────────────────
            var btnSave = new Button
            {
                Text      = "Save & Queue Upload",
                Location  = new Point(232, 360),
                Width     = 170,
                Height    = 36,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(13, 110, 74),
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 9, FontStyle.Bold),
            };
            btnSave.Click += (_, _) => { SaveRequested = true; DialogResult = DialogResult.OK; Close(); };

            var btnDiscard = new Button
            {
                Text      = "Discard",
                Location  = new Point(412, 360),
                Width     = 100,
                Height    = 36,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(200, 50, 50),
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 9),
            };
            btnDiscard.Click += (_, _) => { SaveRequested = false; DialogResult = DialogResult.Cancel; Close(); };

            var btnRescan = new Button
            {
                Text      = "Re-scan",
                Location  = new Point(520, 360),
                Width     = 90,
                Height    = 36,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(220, 180, 50),
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 9),
            };
            btnRescan.Click += (_, _) => { SaveRequested = false; DialogResult = DialogResult.Retry; Close(); };

            Controls.Add(pic);
            Controls.AddRange(detailControls.ToArray());
            Controls.AddRange(new Control[] { btnSave, btnDiscard, btnRescan });
        }
    }
}
