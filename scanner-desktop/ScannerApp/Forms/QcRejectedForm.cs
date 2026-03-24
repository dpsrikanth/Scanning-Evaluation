using ScannerApp.Models;

namespace ScannerApp.Forms
{
    /// <summary>Lists QC-rejected booklets; double-click sets PickedBookletId and closes OK.</summary>
    public sealed class QcRejectedForm : Form
    {
        public string? PickedBookletId { get; private set; }

        public QcRejectedForm(IReadOnlyList<QcRejectedRow> rows)
        {
            Text = "QC rejected booklets — double-click to pick ID for rescan";
            Width = 840;
            Height = 440;
            StartPosition = FormStartPosition.CenterParent;
            FormBorderStyle = FormBorderStyle.Sizable;
            MinimumSize = new Size(620, 320);

            var lv = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                GridLines = true,
            };
            lv.Columns.Add("Booklet ID", 220);
            lv.Columns.Add("Paper", 120);
            lv.Columns.Add("Date", 100);
            lv.Columns.Add("Vendor", 80);
            lv.Columns.Add("Customer", 80);
            lv.Columns.Add("Reasons", 300);

            foreach (var r in rows)
            {
                var reasons = string.Join(" | ", new[] { r.VendorQcReason, r.CustomerQcReason }
                    .Where(s => !string.IsNullOrWhiteSpace(s)));
                var item = new ListViewItem(r.BookletID);
                item.SubItems.Add(r.PaperCode);
                item.SubItems.Add(r.ScanDate);
                item.SubItems.Add(r.VendorQcStatus ?? "");
                item.SubItems.Add(r.CustomerQcStatus ?? "");
                item.SubItems.Add(reasons);
                item.Tag = r.BookletID;
                lv.Items.Add(item);
            }

            lv.DoubleClick += (_, _) =>
            {
                if (lv.SelectedItems.Count == 0) return;
                PickedBookletId = lv.SelectedItems[0].Tag as string;
                DialogResult = DialogResult.OK;
                Close();
            };

            var footer = new Panel { Dock = DockStyle.Bottom, Height = 40 };
            var btnClose = new Button { Text = "Close", AutoSize = true, Anchor = AnchorStyles.Right | AnchorStyles.Top };
            btnClose.Location = new Point(footer.Width - btnClose.Width - 12, 8);
            footer.Resize += (_, _) => btnClose.Left = footer.Width - btnClose.Width - 12;
            btnClose.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };
            footer.Controls.Add(btnClose);

            Controls.Add(lv);
            Controls.Add(footer);
        }
    }
}
