using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using ScannerApp.Models;
using ScannerApp.Services;
using ScannerApp.Utils;

namespace ScannerApp.Forms
{
    public class MainForm : Form
    {
        // ── Services ──────────────────────────────────────────────────────────
        private readonly ApiService      _api;
        private readonly BarcodeService  _barcode;
        private readonly ServerBarcodeApiService _serverBarcode;
        private IScannerService          _scanner;
        private LocalQueueService?       _queue;
        private DesktopNotifier?         _notifier;

        // ── State ─────────────────────────────────────────────────────────────
        private ScanSettings?            _settings;
        private WorkstationInfo?         _myWorkstation;
        private ScanTemplate?            _selectedTemplate;
        private string                   _storagePath = "";
        private readonly List<ScannedPage> _currentPages = new();
        private CancellationTokenSource? _scanCts;
        private bool                     _isScanning;
        private bool                     _isPaused;
        private volatile bool            _cancelRequested;
        private int                      _scanSessionId;

        // ── Pause / resume gate ──────────────────────────────────────────────
        private ManualResetEventSlim     _pauseEvent = new(true);

        // ── Real-time barcode collection ─────────────────────────────────────
        private readonly ConcurrentDictionary<int, string?> _pageBarcodesRealtime = new();
        private volatile bool            _barcodeFailureDetected;
        private const string BookletNameZoneKey = "bookletname";

        // ── Connectivity polling ─────────────────────────────────────────────
        private System.Windows.Forms.Timer? _connectivityTimer;

        // ── Left panel controls ───────────────────────────────────────────────
        private Label      _lblOperator     = null!;
        private Label      _lblWorkstationCode = null!;
        private Label      _lblWorkstationName = null!;
        private Label      _lblDriverMode   = null!;
        private ComboBox   _cboExam         = null!;
        private ComboBox   _cboPaper        = null!;
        private ComboBox   _cboTemplate     = null!;
        private ComboBox   _cboScanner           = null!;
        private Button     _btnSetDefaultScanner = null!;
        private Button     _btnViewLog           = null!;
        private CheckBox   _chkDeskewTrim   = null!;
        private CheckBox   _chkTwainUi      = null!;
        private CheckBox   _chkUseServerBarcode = null!;
        private TextBox    _txtServerBarcodeUrl = null!;
        private Label      _lblQcRescan     = null!;
        private TextBox    _txtQcRescanId   = null!;
        private TextBox    _txtTemplateDetail = null!;
        private Button     _btnRefresh      = null!;
        private Button     _btnScan         = null!;
        private ProgressBar _progressBar    = null!;
        private Label      _lblStatus       = null!;

        // ── Center panel controls ─────────────────────────────────────────────
        private ListView   _lvPages         = null!;
        private ImageList  _pageImages      = null!;
        private PictureBox _picPreview      = null!;
        private Label      _lblScanPreviewMeta = null!;
        private Label      _lblBatchInfo    = null!;

        // ── Bottom panel controls ─────────────────────────────────────────────
        private ListView   _lvQueue         = null!;
        /// <summary>Upload queue ListView column indices (Details view; SubItems[0] is Booklet ID).</summary>
        private const int QColStatus = 5;
        private const int QColErr    = 12;
        private const int QColPdf   = 13;
        private const int QColUp    = 14;
        private const int QColCount = 15;
        private static readonly float[] QColWeight =
        {
            16f, 7f, 7f, 8f, 5f, 10f, 9f, 9f, 9f, 5f, 5f, 9f, 22f, 4f, 4f,
        };
        private static readonly int[] QColMinW =
        {
            120, 44, 44, 56, 40, 72, 92, 92, 92, 36, 36, 88, 96, 36, 40,
        };
        private bool _queueFilterUiProgrammatic;
        private Label      _lblQueueHeader  = null!;
        private Button     _btnQueueFilter  = null!;
        /// <summary>DB status tokens: Pending, Uploading, Uploaded, Failed.</summary>
        private readonly HashSet<string> _queueFilterDbStatuses = new(StringComparer.OrdinalIgnoreCase) { "Pending" };
        private ToolStripDropDown? _queueFilterDropDown;
        private CheckBox? _qfPending;
        private CheckBox? _qfUploaded;
        private CheckBox? _qfFailed;
        private CheckBox? _qfProcessing;
        private Button     _btnQcRejected   = null!;
        private Button     _btnRetryFailed  = null!;
        private TextBox    _txtActivityLog  = null!;
        private Label      _lblNextUpload   = null!;
        private const int ActivityLogMaxLines = 500;


        // ── Scan flow control buttons ────────────────────────────────────────
        private Button     _btnPause        = null!;
        private Button     _btnCancel       = null!;

        // ── Header bar ────────────────────────────────────────────────────────
        private Panel      _headerPanel     = null!;
        private Label      _lblAppTitle     = null!;
        private Label      _lblServerStatus = null!;
        private Label      _lblScannerStatus = null!;
        private Button     _btnLogout       = null!;
        private Button     _btnChangePath   = null!;
        private Button     _btnToggleQueue  = null!;
        private Button     _btnToggleActivity = null!;

        // ── Bottom panel refs ────────────────────────────────────────────────
        private Panel      _queueCard       = null!;
        private Panel      _logCard         = null!;
        private TableLayoutPanel _bottomOuter = null!;
        private TableLayoutPanel _mainTable  = null!;
        private ImageList?       _queueRowHeightImages;
        private Panel?           _leftScrollHost;
        private TableLayoutPanel? _leftConfigStack;

        // ── Design system (enterprise) ───────────────────────────────────────
        private static readonly Color ColorPrimary       = Color.FromArgb(0x3F, 0x51, 0xB5);
        private static readonly Color ColorPrimaryDark   = Color.FromArgb(0x30, 0x3F, 0x9F);
        private static readonly Color ColorSurface       = Color.FromArgb(0xF5, 0xF7, 0xFA);
        private static readonly Color ColorCard          = Color.White;
        private static readonly Color ColorBorder        = Color.FromArgb(0xE5, 0xE7, 0xEB);
        private static readonly Color ColorText          = Color.FromArgb(0x1F, 0x29, 0x37);
        private static readonly Color ColorMuted         = Color.FromArgb(0x6B, 0x72, 0x80);
        private static readonly Color ColorSuccess       = Color.FromArgb(0x10, 0xB9, 0x81);
        private static readonly Color ColorDanger        = Color.FromArgb(0xEF, 0x44, 0x44);
        private static readonly Color ColorWarning       = Color.FromArgb(0xF5, 0x9E, 0x0B);
        private static readonly Color ColorQueueHeaderBg = Color.FromArgb(0xF3, 0xF4, 0xF6);
        private static readonly Color ColorInputBg       = Color.FromArgb(0xF9, 0xFA, 0xFB);
        private static readonly Color ColorAccent        = ColorPrimary;
        private static readonly string LocalSettingsPath =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ScannerApp", "desktop-settings.json");

        public MainForm(ApiService api)
        {
            _api     = api;
            _barcode = new BarcodeService();
            _serverBarcode = new ServerBarcodeApiService();
            _scanner = new ScannerService();   // default WIA; may swap to TWAIN after workstation load
            InitializeComponent();
            LoadDesktopSettings();
            Load += MainForm_Load;
        }

        // ── UI Construction ───────────────────────────────────────────────────

        private void InitializeComponent()
        {
            Text            = $"Scanner — Scanning Station — {AppVersion.GetTitleSuffix()}";
            Size            = new Size(1280, 820);
            MinimumSize     = new Size(1024, 700);
            StartPosition   = FormStartPosition.CenterScreen;
            BackColor       = ColorSurface;
            Font            = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point);
            FormBorderStyle = FormBorderStyle.Sizable;

            BuildMainLayout();
            BuildHeader();
            _headerPanel.BringToFront();
        }

        private void LoadDesktopSettings()
        {
            try
            {
                if (!File.Exists(LocalSettingsPath)) return;
                var json = File.ReadAllText(LocalSettingsPath);
                var obj = JsonConvert.DeserializeObject<Dictionary<string, string>>(json);
                if (obj == null) return;

                if (obj.TryGetValue("useServerBarcode", out var useSrv))
                    _serverBarcode.Enabled = useSrv.Equals("true", StringComparison.OrdinalIgnoreCase);
                if (obj.TryGetValue("serverBarcodeUrl", out var srvUrl) && !string.IsNullOrWhiteSpace(srvUrl))
                    _serverBarcode.BaseUrl = srvUrl.Trim().TrimEnd('/');

                if (obj.TryGetValue("activityPanelVisible", out var apv) && _logCard != null)
                    _logCard.Visible = apv.Equals("true", StringComparison.OrdinalIgnoreCase);

                if (obj.TryGetValue("queueFilterStatuses", out var qfs) && !string.IsNullOrWhiteSpace(qfs))
                {
                    _queueFilterDbStatuses.Clear();
                    foreach (var part in qfs.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    {
                        if (IsKnownQueueDbStatus(part))
                            _queueFilterDbStatuses.Add(part);
                    }
                    if (_queueFilterDbStatuses.Count == 0)
                        _queueFilterDbStatuses.Add("Pending");
                }
            }
            catch
            {
                // ignore local settings load failures
            }
            finally
            {
                SyncBottomPanelTogglesFromState();
            }
        }

        private void SaveDesktopSettings()
        {
            try
            {
                var dir = Path.GetDirectoryName(LocalSettingsPath);
                if (!string.IsNullOrEmpty(dir))
                    Directory.CreateDirectory(dir);

                Dictionary<string, string> obj = new();
                if (File.Exists(LocalSettingsPath))
                {
                    try
                    {
                        obj = JsonConvert.DeserializeObject<Dictionary<string, string>>(
                            File.ReadAllText(LocalSettingsPath)) ?? new Dictionary<string, string>();
                    }
                    catch
                    {
                        obj = new Dictionary<string, string>();
                    }
                }

                obj["useServerBarcode"] = _serverBarcode.Enabled ? "true" : "false";
                obj["serverBarcodeUrl"] = _serverBarcode.BaseUrl;
                if (_logCard != null)
                    obj["activityPanelVisible"] = _logCard.Visible ? "true" : "false";
                obj["queueFilterStatuses"] = string.Join("|",
                    _queueFilterDbStatuses.OrderBy(s => s, StringComparer.OrdinalIgnoreCase));
                File.WriteAllText(LocalSettingsPath, JsonConvert.SerializeObject(obj, Formatting.Indented));
            }
            catch
            {
                // ignore local settings save failures
            }
        }

        private static bool IsKnownQueueDbStatus(string s) =>
            s.Equals("Pending", StringComparison.OrdinalIgnoreCase)
            || s.Equals("Uploading", StringComparison.OrdinalIgnoreCase)
            || s.Equals("Uploaded", StringComparison.OrdinalIgnoreCase)
            || s.Equals("Failed", StringComparison.OrdinalIgnoreCase);

        private void SyncBottomPanelTogglesFromState()
        {
            try
            {
                if (_btnToggleActivity != null && _logCard != null)
                    UpdateHeaderNavToggleVisual(_btnToggleActivity, _logCard.Visible);
                if (_btnToggleQueue != null && _queueCard != null)
                    UpdateHeaderNavToggleVisual(_btnToggleQueue, _queueCard.Visible);
                UpdateQueueFilterButtonCaption();
                AdjustBottomPanelLayout();
                LayoutQueueListViewColumns();
            }
            catch
            {
                // partially constructed UI (designer / early init)
            }
        }

        private static void UpdateHeaderNavToggleVisual(Button b, bool open) =>
            b.BackColor = open ? Color.FromArgb(58, 255, 255, 255) : Color.Transparent;

        private void UpdateQueueFilterButtonCaption()
        {
            if (_btnQueueFilter == null) return;
            int n = _queueFilterDbStatuses.Count;
            const int allFour = 4;
            _btnQueueFilter.Text = n == 0
                ? "Status: (none)"
                : n >= allFour ? "Status: All" : $"{n} selected";
        }

        private void EnsureQueueFilterDropDown()
        {
            if (_queueFilterDropDown != null) return;

            var host = new FlowLayoutPanel
            {
                FlowDirection  = FlowDirection.TopDown,
                WrapContents   = false,
                AutoSize       = true,
                Padding        = new Padding(10, 8, 10, 8),
                MinimumSize    = new Size(210, 0),
                MaximumSize    = new Size(280, 480),
            };

            _qfPending = new CheckBox
            {
                Text     = "Pending",
                AutoSize = true,
                Margin   = new Padding(0, 0, 0, 4),
            };
            _qfUploaded = new CheckBox { Text = "Uploaded", AutoSize = true, Margin = new Padding(0, 0, 0, 4) };
            _qfFailed = new CheckBox { Text = "Failed", AutoSize = true, Margin = new Padding(0, 0, 0, 4) };
            _qfProcessing = new CheckBox
            {
                Text     = "Processing (uploading)",
                AutoSize = true,
                Margin   = new Padding(0, 0, 0, 8),
            };

            void onFilterCheckChanged(object? s, EventArgs e)
            {
                if (_queueFilterUiProgrammatic) return;
                _queueFilterDbStatuses.Clear();
                if (_qfPending!.Checked) _queueFilterDbStatuses.Add("Pending");
                if (_qfUploaded!.Checked) _queueFilterDbStatuses.Add("Uploaded");
                if (_qfFailed!.Checked) _queueFilterDbStatuses.Add("Failed");
                if (_qfProcessing!.Checked) _queueFilterDbStatuses.Add("Uploading");
                UpdateQueueFilterButtonCaption();
                SaveDesktopSettings();
                RefreshQueueView();
            }

            foreach (var cb in new[] { _qfPending, _qfUploaded, _qfFailed, _qfProcessing })
                cb!.CheckedChanged += onFilterCheckChanged;

            var linkRow = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.LeftToRight,
                AutoSize      = true,
                WrapContents  = false,
            };
            var llAll = new LinkLabel
            {
                Text      = "Select all",
                AutoSize  = true,
                Margin    = new Padding(0, 0, 16, 0),
                LinkColor = ColorPrimary,
            };
            llAll.Click += (_, _) =>
            {
                _queueFilterUiProgrammatic = true;
                try
                {
                    _qfPending!.Checked = true;
                    _qfUploaded!.Checked = true;
                    _qfFailed!.Checked = true;
                    _qfProcessing!.Checked = true;
                }
                finally
                {
                    _queueFilterUiProgrammatic = false;
                }

                _queueFilterDbStatuses.Clear();
                _queueFilterDbStatuses.Add("Pending");
                _queueFilterDbStatuses.Add("Uploaded");
                _queueFilterDbStatuses.Add("Failed");
                _queueFilterDbStatuses.Add("Uploading");
                UpdateQueueFilterButtonCaption();
                SaveDesktopSettings();
                RefreshQueueView();
            };
            var llClr = new LinkLabel { Text = "Clear all", AutoSize = true, LinkColor = ColorPrimary };
            llClr.Click += (_, _) =>
            {
                _queueFilterUiProgrammatic = true;
                try
                {
                    _qfPending!.Checked = false;
                    _qfUploaded!.Checked = false;
                    _qfFailed!.Checked = false;
                    _qfProcessing!.Checked = false;
                }
                finally
                {
                    _queueFilterUiProgrammatic = false;
                }

                _queueFilterDbStatuses.Clear();
                UpdateQueueFilterButtonCaption();
                SaveDesktopSettings();
                RefreshQueueView();
            };
            linkRow.Controls.Add(llAll);
            linkRow.Controls.Add(llClr);

            host.Controls.Add(_qfPending);
            host.Controls.Add(_qfUploaded);
            host.Controls.Add(_qfFailed);
            host.Controls.Add(_qfProcessing);
            host.Controls.Add(linkRow);

            var tsHost = new ToolStripControlHost(host)
            {
                AutoSize = true,
                Padding  = Padding.Empty,
                Margin   = Padding.Empty,
            };
            _queueFilterDropDown = new ToolStripDropDown
            {
                Padding              = Padding.Empty,
                Margin               = Padding.Empty,
                DropShadowEnabled    = true,
                AutoSize             = true,
                AutoClose            = true,
            };
            _queueFilterDropDown.Items.Add(tsHost);
        }

        private void SyncQueueFilterCheckboxesFromModel()
        {
            EnsureQueueFilterDropDown();
            if (_qfPending == null) return;
            _queueFilterUiProgrammatic = true;
            try
            {
                _qfPending.Checked = _queueFilterDbStatuses.Contains("Pending");
                _qfUploaded!.Checked = _queueFilterDbStatuses.Contains("Uploaded");
                _qfFailed!.Checked = _queueFilterDbStatuses.Contains("Failed");
                _qfProcessing!.Checked = _queueFilterDbStatuses.Contains("Uploading");
            }
            finally
            {
                _queueFilterUiProgrammatic = false;
            }
        }

        private void BtnQueueFilter_Click(object? sender, EventArgs e)
        {
            EnsureQueueFilterDropDown();
            SyncQueueFilterCheckboxesFromModel();
            if (_queueFilterDropDown == null || _btnQueueFilter == null) return;
            _queueFilterDropDown.Show(_btnQueueFilter, new Point(0, _btnQueueFilter.Height));
        }

        private static GraphicsPath CreateRoundedRectPath(Rectangle bounds, int radius)
        {
            int d = Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height));
            if (d <= 0)
            {
                var p0 = new GraphicsPath();
                p0.AddRectangle(bounds);
                return p0;
            }

            var path = new GraphicsPath();
            path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        private void LayoutQueueListViewColumns()
        {
            if (_lvQueue == null || !_lvQueue.IsHandleCreated || _lvQueue.Columns.Count != QColCount)
                return;

            int avail = _lvQueue.ClientSize.Width;
            if (avail < 360) avail = 360;

            float sumW = 0f;
            foreach (var w in QColWeight)
                sumW += w;

            var widths = new int[QColCount];
            int total = 0;
            for (int i = 0; i < QColCount; i++)
            {
                int w = (int)Math.Round(avail * (QColWeight[i] / sumW));
                if (w < QColMinW[i])
                    w = QColMinW[i];
                widths[i] = w;
                total += w;
            }

            int slack = avail - total;
            if (slack != 0)
                widths[QColErr] = Math.Max(QColMinW[QColErr], widths[QColErr] + slack);

            for (int i = 0; i < QColCount; i++)
                _lvQueue.Columns[i].Width = widths[i];
        }

        private static Bitmap? CreateMdi2GlyphBitmap(char codePoint, Color fg, int sizePx)
        {
            try
            {
                var bmp = new Bitmap(sizePx, sizePx, PixelFormat.Format32bppArgb);
                using (var g = Graphics.FromImage(bmp))
                {
                    g.Clear(Color.Transparent);
                    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
                    using var font = new Font("Segoe MDL2 Assets", sizePx * 0.72f, FontStyle.Regular, GraphicsUnit.Pixel);
                    var s = codePoint.ToString();
                    var sz = TextRenderer.MeasureText(g, s, font, Size.Empty, TextFormatFlags.NoPadding);
                    int x = Math.Max(0, (sizePx - sz.Width) / 2);
                    int y = Math.Max(0, (sizePx - sz.Height) / 2);
                    TextRenderer.DrawText(g, s, font, new Point(x, y), fg,
                        TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix);
                }

                return bmp;
            }
            catch
            {
                return null;
            }
        }

        private void WireRetryFailedButtonChrome()
        {
            var soft = Color.FromArgb(255, 254, 226, 226);
            var softHover = Color.FromArgb(255, 252, 201, 201);
            var disabledBg = Color.FromArgb(248, 250, 252);
            var fg = Color.FromArgb(0x99, 0x1B, 0x1B);

            _btnRetryFailed.Text = "Retry Failed";
            _btnRetryFailed.TextImageRelation = TextImageRelation.ImageBeforeText;
            _btnRetryFailed.ImageAlign = ContentAlignment.MiddleLeft;
            _btnRetryFailed.Padding = new Padding(10, 0, 12, 0);
            _btnRetryFailed.FlatStyle = FlatStyle.Flat;
            _btnRetryFailed.FlatAppearance.BorderSize = 0;
            _btnRetryFailed.Font = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point);
            _btnRetryFailed.ForeColor = fg;
            _btnRetryFailed.BackColor = soft;
            _btnRetryFailed.Cursor = Cursors.Hand;
            _btnRetryFailed.Width = 132;
            _btnRetryFailed.Height = 30;

            var syncBmp = CreateMdi2GlyphBitmap('\uE72C', fg, 16);
            if (syncBmp != null)
                _btnRetryFailed.Image = syncBmp;

            void ApplyRegion()
            {
                if (_btnRetryFailed.Width <= 1 || _btnRetryFailed.Height <= 1) return;
                var r = new Rectangle(0, 0, _btnRetryFailed.Width - 1, _btnRetryFailed.Height - 1);
                using var path = CreateRoundedRectPath(r, 5);
                _btnRetryFailed.Region?.Dispose();
                _btnRetryFailed.Region = new Region(path);
            }

            _btnRetryFailed.SizeChanged += (_, _) => ApplyRegion();
            _btnRetryFailed.HandleCreated += (_, _) => ApplyRegion();
            _btnRetryFailed.EnabledChanged += (_, _) =>
            {
                _btnRetryFailed.BackColor = _btnRetryFailed.Enabled ? soft : disabledBg;
                _btnRetryFailed.ForeColor = _btnRetryFailed.Enabled ? fg : ColorMuted;
            };
            _btnRetryFailed.MouseEnter += (_, _) =>
            {
                if (_btnRetryFailed.Enabled)
                    _btnRetryFailed.BackColor = softHover;
            };
            _btnRetryFailed.MouseLeave += (_, _) =>
            {
                if (_btnRetryFailed.Enabled)
                    _btnRetryFailed.BackColor = soft;
            };
        }

        private static void StyleGhostHeaderButton(Button b, char mdl2Glyph, string caption, int width)
        {
            b.Text = caption;
            b.Width = width;
            b.Height = 32;
            b.FlatStyle = FlatStyle.Flat;
            b.ForeColor = Color.White;
            b.Cursor = Cursors.Hand;
            b.FlatAppearance.BorderColor = Color.FromArgb(120, 140, 200);
            b.FlatAppearance.BorderSize = 1;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(45, 255, 255, 255);
            b.BackColor = Color.Transparent;
            b.Font = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point);
            b.TextImageRelation = TextImageRelation.ImageBeforeText;
            b.ImageAlign = ContentAlignment.MiddleLeft;
            b.TextAlign = ContentAlignment.MiddleRight;
            b.Padding = new Padding(6, 0, 10, 0);
            var img = CreateMdi2GlyphBitmap(mdl2Glyph, Color.White, 16);
            if (img != null)
                b.Image = img;
        }

        private void WireHeaderToggleHover(Button b, Func<bool> isOpen)
        {
            b.MouseEnter += (_, _) =>
            {
                b.BackColor = isOpen() ? Color.FromArgb(72, 255, 255, 255) : Color.FromArgb(40, 255, 255, 255);
            };
            b.MouseLeave += (_, _) =>
            {
                b.BackColor = isOpen() ? Color.FromArgb(58, 255, 255, 255) : Color.Transparent;
            };
        }

        private void BuildHeader()
        {
            _headerPanel = new Panel
            {
                Dock      = DockStyle.Top,
                Height    = 56,
                BackColor = ColorPrimaryDark,
                Padding   = new Padding(16, 8, 16, 8),
            };

            _lblAppTitle = new Label
            {
                Text      = "Scanning Station",
                Font      = new Font("Segoe UI", 12f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = Color.White,
                Dock      = DockStyle.Left,
                TextAlign = ContentAlignment.MiddleLeft,
                AutoSize  = false,
                Width     = 220,
            };

            _lblOperator = new Label
            {
                Text         = "",
                Font         = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor    = Color.White,
                Dock         = DockStyle.Fill,
                TextAlign    = ContentAlignment.MiddleCenter,
                AutoSize     = false,
                AutoEllipsis = true,
            };

            _btnLogout = new Button
            {
                Text      = "Logout",
                Width     = 88,
                Height    = 32,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.Transparent,
                ForeColor = Color.White,
                Cursor    = Cursors.Hand,
                Dock      = DockStyle.Right,
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
            };
            _btnLogout.FlatAppearance.BorderColor = Color.FromArgb(180, 190, 220);
            _btnLogout.FlatAppearance.BorderSize = 1;
            _btnLogout.Click += (_, _) =>
            {
                _queue?.StopBackgroundUpload();
                _queue?.Dispose();
                _queue = null;          // prevent OnFormClosing from touching disposed queue
                _scanCts?.Cancel();
                _scanCts?.Dispose();
                _scanCts = null;
                Application.Restart();
            };

            _btnChangePath = new Button { Dock = DockStyle.Right };
            StyleGhostHeaderButton(_btnChangePath, '\uE8B7', "Storage", 112);
            _btnChangePath.Click += BtnChangePath_Click;

            _btnViewLog = new Button { Dock = DockStyle.Right };
            StyleGhostHeaderButton(_btnViewLog, '\uE8A5', "Log", 84);
            _btnViewLog.Click += (_, _) =>
            {
                var logPath = AppLogger.TodayLogPath;
                if (!File.Exists(logPath))
                    MessageBox.Show("No log file found for today.", "Log",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                else
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName        = logPath,
                        UseShellExecute = true,
                    });
            };

            _btnQcRejected = new Button { Dock = DockStyle.Right };
            StyleGhostHeaderButton(_btnQcRejected, '\uE7BA', "QC rejected", 128);
            _btnQcRejected.Click += BtnQcRejected_Click;

            _lblServerStatus = new Label
            {
                Text      = "● Server: …",
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                Dock      = DockStyle.Right,
                Width     = 124,
                TextAlign = ContentAlignment.MiddleCenter,
                AutoSize  = false,
            };

            _lblScannerStatus = new Label
            {
                Text      = "● Scanner: …",
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                Dock      = DockStyle.Right,
                Width     = 132,
                TextAlign = ContentAlignment.MiddleCenter,
                AutoSize  = false,
            };

            _btnToggleQueue = new Button { Dock = DockStyle.Right };
            StyleGhostHeaderButton(_btnToggleQueue, '\uE8FD', "Queue", 100);
            _btnToggleQueue.Click += (_, _) =>
            {
                _queueCard.Visible = !_queueCard.Visible;
                UpdateHeaderNavToggleVisual(_btnToggleQueue, _queueCard.Visible);
                AdjustBottomPanelLayout();
            };
            WireHeaderToggleHover(_btnToggleQueue, () => _queueCard.Visible);

            _btnToggleActivity = new Button { Dock = DockStyle.Right };
            StyleGhostHeaderButton(_btnToggleActivity, '\uE7ED', "Activity", 108);
            _btnToggleActivity.Click += (_, _) =>
            {
                _logCard.Visible = !_logCard.Visible;
                UpdateHeaderNavToggleVisual(_btnToggleActivity, _logCard.Visible);
                AdjustBottomPanelLayout();
                SaveDesktopSettings();
            };
            WireHeaderToggleHover(_btnToggleActivity, () => _logCard.Visible);

            _headerPanel.Controls.AddRange(new Control[]
                { _lblAppTitle, _lblOperator,
                  _btnToggleActivity, _btnToggleQueue, _btnQcRejected, _btnViewLog, _btnChangePath,
                  _lblScannerStatus, _lblServerStatus, _btnLogout });
            Controls.Add(_headerPanel);
        }

        private void BuildMainLayout()
        {
            _mainTable = new TableLayoutPanel
            {
                Dock        = DockStyle.Fill,
                ColumnCount = 3,
                RowCount    = 2,
                Padding     = new Padding(16),
                BackColor   = ColorSurface,
            };
            _mainTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 24f));
            _mainTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            _mainTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 26f));
            _mainTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            _mainTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 280f));

            _mainTable.Controls.Add(BuildLeftPanel(), 0, 0);
            _mainTable.Controls.Add(BuildCenterPreviewPanel(), 1, 0);
            _mainTable.Controls.Add(BuildRightPanel(), 2, 0);
            var bottom = BuildBottomPanel();
            _mainTable.Controls.Add(bottom, 0, 1);
            _mainTable.SetColumnSpan(bottom, 3);

            Controls.Add(_mainTable);
        }

        private static Panel CreateSectionCard(string title, out TableLayoutPanel body)
        {
            var card = new Panel
            {
                Dock         = DockStyle.Top,
                Margin       = new Padding(0, 0, 0, 16),
                BackColor    = ColorCard,
                Padding      = new Padding(16),
                AutoSize     = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
            };
            card.Paint += PaintCardBorder;

            var stack = new TableLayoutPanel
            {
                Dock          = DockStyle.Top,
                ColumnCount   = 1,
                RowCount      = 2,
                AutoSize      = true,
                AutoSizeMode  = AutoSizeMode.GrowAndShrink,
            };
            stack.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            var lblTitle = new Label
            {
                Text      = title,
                Font      = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                Dock      = DockStyle.Fill,
                AutoSize  = true,
                Margin    = new Padding(0, 0, 0, 10),
            };

            body = new TableLayoutPanel
            {
                Dock         = DockStyle.Fill,
                ColumnCount  = 1,
                AutoSize     = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
            };
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            stack.Controls.Add(lblTitle, 0, 0);
            stack.Controls.Add(body, 0, 1);
            card.Controls.Add(stack);
            return card;
        }

        private static int AddCardRow(TableLayoutPanel body, Control c, int row)
        {
            body.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            body.Controls.Add(c, 0, row);
            return row + 1;
        }

        private Panel BuildLeftPanel()
        {
            var scrollHost = new Panel
            {
                Dock       = DockStyle.Fill,
                BackColor  = ColorSurface,
                AutoScroll = true,
                Padding    = new Padding(0, 0, 8, 0),
            };

            var stack = new TableLayoutPanel
            {
                Dock         = DockStyle.Top,
                ColumnCount  = 1,
                AutoSize     = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding      = new Padding(0),
            };
            stack.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            int row = 0;

            var lblConfigColumn = new Label
            {
                Text      = "Configuration",
                Font      = new Font("Segoe UI", 11f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = ColorText,
                Dock      = DockStyle.Top,
                AutoSize  = true,
                Margin    = new Padding(0, 0, 0, 8),
            };
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stack.Controls.Add(lblConfigColumn, 0, row++);

            // Workstation strip (card)
            var wsCard = new Panel
            {
                Dock         = DockStyle.Top,
                Margin       = new Padding(0, 0, 0, 16),
                BackColor    = ColorCard,
                Padding      = new Padding(12, 12, 12, 12),
                AutoSize     = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
            };
            wsCard.Paint += PaintCardBorder;
            _lblWorkstationCode = new Label
            {
                Text      = "—",
                Font      = new Font("Segoe UI", 11f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = ColorPrimary,
                Dock      = DockStyle.Top,
                AutoSize  = true,
            };
            _lblWorkstationName = new Label
            {
                Text      = "Workstation loading…",
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                Dock      = DockStyle.Top,
                AutoSize  = true,
                Margin    = new Padding(0, 4, 0, 0),
            };
            _lblDriverMode = new Label
            {
                Text      = "Driver: WIA",
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                Dock      = DockStyle.Top,
                AutoSize  = true,
                Margin    = new Padding(0, 10, 0, 0),
            };
            wsCard.Controls.Add(_lblWorkstationCode);
            wsCard.Controls.Add(_lblWorkstationName);
            wsCard.Controls.Add(_lblDriverMode);
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stack.Controls.Add(wsCard, 0, row++);

            // 1. Exam details
            var examCard = CreateSectionCard("EXAM DETAILS", out var examBody);
            _cboExam = MakeComboBox(0, 0, 200);
            _cboExam.Dock = DockStyle.Top;
            _cboExam.Margin = new Padding(0, 0, 0, 12);
            _cboExam.SelectedIndexChanged += CboExam_Changed;
            int er = 0;
            er = AddCardRow(examBody, _cboExam, er);

            _cboPaper = MakeComboBox(0, 0, 200);
            _cboPaper.Dock = DockStyle.Top;
            _cboPaper.Margin = new Padding(0, 0, 0, 12);
            _cboPaper.SelectedIndexChanged += (_, _) => SyncQueueUploadFallback();
            er = AddCardRow(examBody, _cboPaper, er);

            _cboTemplate = MakeComboBox(0, 0, 200);
            _cboTemplate.Dock = DockStyle.Top;
            _cboTemplate.Margin = new Padding(0, 0, 0, 12);
            _cboTemplate.SelectedIndexChanged += CboTemplate_Changed;
            er = AddCardRow(examBody, _cboTemplate, er);

            _txtTemplateDetail = new TextBox
            {
                Dock        = DockStyle.Top,
                Height      = 140,
                Font        = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor   = ColorText,
                BackColor   = ColorInputBg,
                BorderStyle = BorderStyle.FixedSingle,
                Multiline   = true,
                ReadOnly    = true,
                ScrollBars  = ScrollBars.Vertical,
                WordWrap    = false,
                TabStop     = false,
                Cursor      = Cursors.Default,
                Text        = "Select a template above",
            };
            AddCardRow(examBody, _txtTemplateDetail, er);
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stack.Controls.Add(examCard, 0, row++);

            // 2. Scanner settings
            var scanCard = CreateSectionCard("SCANNER SETTINGS", out var scanBody);
            var scannerRow = new TableLayoutPanel
            {
                Dock         = DockStyle.Top,
                ColumnCount  = 2,
                Height       = 36,
                AutoSize     = false,
                Margin       = new Padding(0, 0, 0, 12),
            };
            scannerRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            scannerRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 88f));
            _cboScanner = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Dock          = DockStyle.Fill,
                Font          = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point),
            };
            var btnRow = new FlowLayoutPanel
            {
                Dock         = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false,
                AutoSize     = true,
            };
            _btnRefresh = new Button
            {
                Text      = "⟳",
                Width     = 40,
                Height    = 32,
                FlatStyle = FlatStyle.Flat,
                Margin    = new Padding(4, 0, 0, 0),
            };
            StyleOutlineButton(_btnRefresh);
            _btnRefresh.Click += (_, _) => LoadScanners();
            _btnSetDefaultScanner = new Button
            {
                Text   = "★",
                Width  = 40,
                Height = 32,
                FlatStyle = FlatStyle.Flat,
                Font   = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
            };
            StyleOutlineButton(_btnSetDefaultScanner);
            _btnSetDefaultScanner.Click += (_, _) =>
            {
                if (_cboScanner.SelectedItem is string name)
                {
                    StoragePathDialog.SaveDefaultScanner(name);
                    SetStatus($"Default scanner set: {name}", false);
                }
            };
            var tt = new ToolTip();
            tt.SetToolTip(_btnSetDefaultScanner, "Set as default scanner");
            btnRow.Controls.Add(_btnRefresh);
            btnRow.Controls.Add(_btnSetDefaultScanner);
            scannerRow.Controls.Add(_cboScanner, 0, 0);
            scannerRow.Controls.Add(btnRow, 1, 0);
            int sr = 0;
            sr = AddCardRow(scanBody, scannerRow, sr);

            _chkDeskewTrim = new CheckBox
            {
                Text      = "Deskew & trim borders (software)",
                Dock      = DockStyle.Top,
                AutoSize  = true,
                Checked   = true,
                ForeColor = ColorText,
                Font      = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point),
                Margin    = new Padding(0, 0, 0, 8),
            };
            _chkDeskewTrim.CheckedChanged += (_, _) => RefreshTemplateDetailView();
            var ttDeskew = new ToolTip();
            ttDeskew.SetToolTip(_chkDeskewTrim,
                "When on: grayscale → binarize → Hough line deskew (Emgu CV) with AForge fallback, " +
                "then largest-contour crop and edge trim before saving JPEGs. When off: save scans as captured. " +
                "The booklet PDF uses these saved JPEGs.");
            sr = AddCardRow(scanBody, _chkDeskewTrim, sr);

            _chkTwainUi = new CheckBox
            {
                Text      = "Show TWAIN scanner UI (driver)",
                Dock      = DockStyle.Top,
                AutoSize  = true,
                Visible   = false,
                ForeColor = ColorText,
                Font      = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point),
            };
            _chkTwainUi.CheckedChanged += (_, _) => SyncTwainScannerUiFlag();
            var ttTw = new ToolTip();
            ttTw.SetToolTip(_chkTwainUi, "Opens the scanner vendor’s dialog for one scan (cover open, colour, etc.). TWAIN only.");
            sr = AddCardRow(scanBody, _chkTwainUi, sr);

            _chkUseServerBarcode = new CheckBox
            {
                Text      = "Use server barcode API (ZXing-WASM)",
                Dock      = DockStyle.Top,
                AutoSize  = true,
                ForeColor = ColorText,
                Font      = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point),
                Margin    = new Padding(0, 8, 0, 6),
                Checked   = _serverBarcode.Enabled,
            };
            _chkUseServerBarcode.CheckedChanged += (_, _) =>
            {
                _serverBarcode.Enabled = _chkUseServerBarcode.Checked;
                _txtServerBarcodeUrl.Enabled = _chkUseServerBarcode.Checked;
                SaveDesktopSettings();
                SetStatus(_chkUseServerBarcode.Checked
                    ? "Barcode mode: server API"
                    : "Barcode mode: local reader", false);
            };
            sr = AddCardRow(scanBody, _chkUseServerBarcode, sr);

            _txtServerBarcodeUrl = new TextBox
            {
                Dock        = DockStyle.Top,
                Height      = 32,
                Font        = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor   = ColorText,
                BackColor   = ColorInputBg,
                BorderStyle = BorderStyle.FixedSingle,
                Text        = _serverBarcode.BaseUrl,
                Enabled     = _serverBarcode.Enabled,
            };
            _txtServerBarcodeUrl.Leave += (_, _) =>
            {
                var url = (_txtServerBarcodeUrl.Text ?? "").Trim().TrimEnd('/');
                _serverBarcode.BaseUrl = string.IsNullOrWhiteSpace(url) ? "http://localhost:8787" : url;
                _txtServerBarcodeUrl.Text = _serverBarcode.BaseUrl;
                SaveDesktopSettings();
            };
            var ttSrv = new ToolTip();
            ttSrv.SetToolTip(_txtServerBarcodeUrl, "Example: http://localhost:8787");
            AddCardRow(scanBody, _txtServerBarcodeUrl, sr);

            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stack.Controls.Add(scanCard, 0, row++);

            // QC rescan (compact, still in left column)
            var qcCard = new Panel
            {
                Dock         = DockStyle.Top,
                Margin       = new Padding(0, 0, 0, 16),
                BackColor    = ColorCard,
                Padding      = new Padding(16),
                AutoSize     = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
            };
            qcCard.Paint += PaintCardBorder;
            _lblQcRescan = new Label
            {
                Text      = "QC rescan — Booklet ID",
                Font      = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                Dock      = DockStyle.Top,
                AutoSize  = true,
            };
            _txtQcRescanId = new TextBox
            {
                Dock        = DockStyle.Top,
                Height      = 32,
                Margin      = new Padding(0, 10, 0, 0),
                Font        = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point),
                BorderStyle = BorderStyle.FixedSingle,
                BackColor   = ColorInputBg,
            };
            var ttRescan = new ToolTip();
            ttRescan.SetToolTip(_txtQcRescanId,
                "Optional. Enter the BookletID already stored on the server for a booklet that QC rejected. " +
                "The next scan uses this ID as the folder name and upload key so the server replaces the same booklet (upsert). " +
                "Use “QC rejected…” to pick one from the list.");
            qcCard.Controls.Add(_lblQcRescan);
            qcCard.Controls.Add(_txtQcRescanId);
            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stack.Controls.Add(qcCard, 0, row++);

            // 3. Action
            var actionCard = CreateSectionCard("ACTION", out var actBody);
            _btnScan = new Button
            {
                Text      = "SCAN BOOKLET",
                Dock      = DockStyle.Top,
                Height    = 48,
                FlatStyle = FlatStyle.Flat,
                BackColor = ColorPrimary,
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 11f, FontStyle.Bold, GraphicsUnit.Point),
                Cursor    = Cursors.Hand,
                Margin    = new Padding(0, 0, 0, 12),
                TextImageRelation = TextImageRelation.ImageBeforeText,
                ImageAlign        = ContentAlignment.MiddleLeft,
                TextAlign         = ContentAlignment.MiddleCenter,
                Padding           = new Padding(14, 0, 14, 0),
            };
            var scanGlyph = CreateMdi2GlyphBitmap('\uE722', Color.White, 22);
            if (scanGlyph != null)
                _btnScan.Image = scanGlyph;
            _btnScan.FlatAppearance.BorderSize = 0;
            _btnScan.Click += BtnScan_Click;
            int ar = 0;
            ar = AddCardRow(actBody, _btnScan, ar);

            var flowRow = new Panel
            {
                Dock     = DockStyle.Top,
                Height   = 36,
                Visible  = false,
                Margin   = new Padding(0, 0, 0, 12),
                Name     = "scanFlowRow",
                Tag      = "scanFlowRow",
            };
            _btnPause = new Button
            {
                Text      = "Pause",
                Width     = 120,
                Height    = 34,
                Dock      = DockStyle.Left,
                FlatStyle = FlatStyle.Flat,
                BackColor = ColorWarning,
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point),
                Cursor    = Cursors.Hand,
            };
            _btnPause.FlatAppearance.BorderSize = 0;
            _btnPause.Click += BtnPause_Click;

            _btnCancel = new Button
            {
                Text      = "Cancel",
                Width     = 120,
                Height    = 34,
                Dock      = DockStyle.Right,
                FlatStyle = FlatStyle.Flat,
                BackColor = ColorDanger,
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 9f, FontStyle.Bold, GraphicsUnit.Point),
                Cursor    = Cursors.Hand,
            };
            _btnCancel.FlatAppearance.BorderSize = 0;
            _btnCancel.Click += BtnCancel_Click;

            flowRow.Controls.AddRange(new Control[] { _btnPause, _btnCancel });
            ar = AddCardRow(actBody, flowRow, ar);

            _progressBar = new ProgressBar
            {
                Dock     = DockStyle.Top,
                Height   = 6,
                Style    = ProgressBarStyle.Marquee,
                Visible  = false,
                Margin   = new Padding(0, 0, 0, 8),
            };
            ar = AddCardRow(actBody, _progressBar, ar);

            _lblStatus = new Label
            {
                Dock      = DockStyle.Top,
                Height    = 40,
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                Text      = "Ready",
                TextAlign = ContentAlignment.TopLeft,
            };
            AddCardRow(actBody, _lblStatus, ar);

            stack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            stack.Controls.Add(actionCard, 0, row++);

            _leftScrollHost   = scrollHost;
            _leftConfigStack  = stack;
            scrollHost.Resize += (_, _) => SyncLeftConfigColumnWidth();
            scrollHost.HandleCreated += (_, _) => SyncLeftConfigColumnWidth();

            scrollHost.Controls.Add(stack);
            return scrollHost;
        }

        /// <summary>
        /// Auto-sized <see cref="TableLayoutPanel"/> with <see cref="DockStyle.Top"/> does not receive the parent
        /// width automatically; match the scroll host client width so controls fill the column and vertical scroll works.
        /// </summary>
        private void SyncLeftConfigColumnWidth()
        {
            if (_leftScrollHost == null || _leftConfigStack == null) return;
            int w = _leftScrollHost.ClientSize.Width - _leftScrollHost.Padding.Horizontal;
            if (w < 120) w = 120;
            if (_leftConfigStack.Width != w)
                _leftConfigStack.Width = w;
        }

        private static void StyleOutlineButton(Button b)
        {
            b.FlatStyle = FlatStyle.Flat;
            b.BackColor = ColorCard;
            b.ForeColor = ColorText;
            b.FlatAppearance.BorderColor = ColorBorder;
            b.Cursor = Cursors.Hand;
        }

        private Panel BuildCenterPreviewPanel()
        {
            var outer = new Panel { Dock = DockStyle.Fill, BackColor = ColorSurface, Padding = new Padding(8, 0, 8, 0) };
            var panel = new Panel { Dock = DockStyle.Fill, BackColor = ColorCard, Padding = new Padding(16) };
            panel.Paint += PaintCardBorder;

            var layout = new TableLayoutPanel
            {
                Dock         = DockStyle.Fill,
                ColumnCount  = 1,
                RowCount     = 2,
            };
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            var titleRow = new FlowLayoutPanel
            {
                Dock         = DockStyle.Fill,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                AutoSize     = true,
                Margin       = new Padding(0, 0, 0, 12),
            };
            var lblTitle = new Label
            {
                Text      = "Scan preview",
                Font      = new Font("Segoe UI", 12f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = ColorText,
                AutoSize  = true,
            };
            _lblScanPreviewMeta = new Label
            {
                Text      = "No scan yet",
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                AutoSize  = true,
                Margin    = new Padding(16, 4, 0, 0),
            };
            titleRow.Controls.Add(lblTitle);
            titleRow.Controls.Add(_lblScanPreviewMeta);

            _picPreview = new PictureBox
            {
                Dock      = DockStyle.Fill,
                SizeMode  = PictureBoxSizeMode.Zoom,
                BackColor = ColorInputBg,
                BorderStyle = BorderStyle.FixedSingle,
            };

            layout.Controls.Add(titleRow, 0, 0);
            layout.Controls.Add(_picPreview, 0, 1);
            panel.Controls.Add(layout);
            outer.Controls.Add(panel);
            return outer;
        }

        private Panel BuildRightPanel()
        {
            var panel = new Panel { Dock = DockStyle.Fill, BackColor = ColorSurface, Padding = new Padding(8, 0, 0, 0) };
            var card = new Panel
            {
                Dock      = DockStyle.Fill,
                BackColor = ColorCard,
                Padding   = new Padding(16),
            };
            card.Paint += PaintCardBorder;

            var layout = new TableLayoutPanel
            {
                Dock        = DockStyle.Fill,
                ColumnCount = 1,
                RowCount    = 3,
            };
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            var hdr = new Label
            {
                Text      = "Current booklet",
                Font      = new Font("Segoe UI", 12f, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = ColorText,
                Dock      = DockStyle.Top,
                AutoSize  = true,
                Margin    = new Padding(0, 0, 0, 8),
            };
            _lblBatchInfo = new Label
            {
                Text      = "Current booklet · 0 pages",
                Font      = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = ColorMuted,
                Dock      = DockStyle.Top,
                AutoSize  = true,
                Margin    = new Padding(0, 0, 0, 12),
            };

            _pageImages = new ImageList { ImageSize = new Size(72, 96), ColorDepth = ColorDepth.Depth32Bit };
            _lvPages = new ListView
            {
                Dock             = DockStyle.Fill,
                View             = View.LargeIcon,
                LargeImageList   = _pageImages,
                BackColor        = ColorInputBg,
                BorderStyle      = BorderStyle.FixedSingle,
                MultiSelect      = false,
                ShowItemToolTips = true,
                Font             = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
            };
            _lvPages.SelectedIndexChanged += LvPages_SelectedChanged;
            var ctxPages = new ContextMenuStrip();
            var miDecode = new ToolStripMenuItem("Decode all barcodes on pages");
            miDecode.Click += MiDecodeBarcodes_Click;
            ctxPages.Items.Add(miDecode);
            _lvPages.ContextMenuStrip = ctxPages;

            layout.Controls.Add(hdr, 0, 0);
            layout.Controls.Add(_lblBatchInfo, 0, 1);
            layout.Controls.Add(_lvPages, 0, 2);
            card.Controls.Add(layout);
            panel.Controls.Add(card);
            return panel;
        }

        private Panel BuildBottomPanel()
        {
            var outer = new TableLayoutPanel
            {
                Dock        = DockStyle.Fill,
                ColumnCount = 1,
                RowCount    = 2,
                BackColor   = ColorCard,
                Padding     = new Padding(8, 6, 8, 6),
            };
            outer.RowStyles.Add(new RowStyle(SizeType.Percent, 58f));
            outer.RowStyles.Add(new RowStyle(SizeType.Percent, 42f));
            _bottomOuter = outer;

            var queueCard = new Panel { Dock = DockStyle.Fill, BackColor = ColorCard };
            _queueCard = queueCard;
            queueCard.Paint += PaintCardBorder;

            // Header row: queue label + status filter dropdown
            var headerRow = new Panel
            {
                Dock   = DockStyle.Top,
                Height = 32,
            };

            _lblQueueHeader = new Label
            {
                Text      = "Upload Queue (0 items)",
                Font      = new Font("Segoe UI", 9, FontStyle.Bold),
                ForeColor = ColorText,
                Dock      = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
            };

            _lblNextUpload = new Label
            {
                Text      = "",
                Font      = new Font("Segoe UI", 8f),
                ForeColor = ColorMuted,
                Dock      = DockStyle.Top,
                Height    = 22,
                TextAlign = ContentAlignment.MiddleLeft,
            };

            _btnQueueFilter = new Button
            {
                Dock          = DockStyle.Right,
                Width         = 128,
                Height        = 28,
                Font          = new Font("Segoe UI", 8.5f, FontStyle.Regular, GraphicsUnit.Point),
                TextAlign     = ContentAlignment.MiddleCenter,
                Cursor        = Cursors.Hand,
            };
            StyleOutlineButton(_btnQueueFilter);
            _btnQueueFilter.Click += BtnQueueFilter_Click;

            _btnRetryFailed = new Button { Dock = DockStyle.Right, Cursor = Cursors.Hand };
            WireRetryFailedButtonChrome();
            _btnRetryFailed.Click += BtnRetryFailed_Click;

            headerRow.Controls.Add(_btnQueueFilter);
            headerRow.Controls.Add(_btnRetryFailed);
            headerRow.Controls.Add(_lblQueueHeader);

            _queueRowHeightImages ??= CreateQueueRowHeightImageList();
            _lvQueue = new ListView
            {
                Dock               = DockStyle.Fill,
                View               = View.Details,
                FullRowSelect      = true,
                GridLines          = false,
                BackColor          = ColorCard,
                BorderStyle        = BorderStyle.None,
                Font               = new Font("Segoe UI", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ShowItemToolTips   = true,
                OwnerDraw          = true,
                HideSelection      = false,
                SmallImageList     = _queueRowHeightImages,
            };
            _lvQueue.DrawColumnHeader += LvQueue_DrawColumnHeader;
            _lvQueue.DrawSubItem += LvQueue_DrawSubItem;
            _lvQueue.Columns.AddRange(new[]
            {
                new ColumnHeader { Text = "Booklet ID",         Width = 160 },
                new ColumnHeader { Text = "Exam",             Width = 52  },
                new ColumnHeader { Text = "Paper",            Width = 52  },
                new ColumnHeader { Text = "Roll No",          Width = 72  },
                new ColumnHeader { Text = "Pages",            Width = 48  },
                new ColumnHeader { Text = "Status",           Width = 72  },
                new ColumnHeader { Text = "Scan started",     Width = 112 },
                new ColumnHeader { Text = "Scan completed",   Width = 112 },
                new ColumnHeader { Text = "Uploaded",         Width = 112 },
                new ColumnHeader { Text = "Scan s",           Width = 48  },
                new ColumnHeader { Text = "Proc s",           Width = 48  },
                new ColumnHeader { Text = "Next upload",      Width = 108 },
                new ColumnHeader { Text = "Error",            Width = 140 },
                new ColumnHeader { Text = "PDF",              Width = 44  },
                new ColumnHeader { Text = "Upload",           Width = 52  },
            });
            LayoutQueueListViewColumns();
            _lvQueue.MouseClick += LvQueue_MouseClick;
            _lvQueue.SizeChanged += (_, _) => LayoutQueueListViewColumns();

            // Right-click context menu for queue rows
            var ctxQueue = new ContextMenuStrip();
            var miRetryOne  = new ToolStripMenuItem("⟳  Reupload this booklet");
            var miCopyError = new ToolStripMenuItem("📋  Copy error reason");
            miRetryOne.Click  += MiRetryOne_Click;
            miCopyError.Click += MiCopyError_Click;
            ctxQueue.Items.AddRange(new ToolStripItem[] { miRetryOne, miCopyError });
            ctxQueue.Opening += (_, _) =>
            {
                bool hasSelection = _lvQueue.SelectedItems.Count > 0;
                var selStatus = hasSelection
                    ? _lvQueue.SelectedItems[0].SubItems[QColStatus].Text
                    : "";
                miRetryOne.Enabled  = hasSelection
                    && selStatus != "Uploading"
                    && (selStatus == "Failed" || selStatus == "Pending" || selStatus == "Uploaded");
                miCopyError.Enabled = hasSelection && !string.IsNullOrEmpty(_lvQueue.SelectedItems[0].SubItems[QColErr].Text);
            };
            _lvQueue.ContextMenuStrip = ctxQueue;

            queueCard.Controls.Add(_lvQueue);
            queueCard.Controls.Add(_lblNextUpload);
            queueCard.Controls.Add(headerRow);

            var logCard = new Panel { Dock = DockStyle.Fill, BackColor = ColorCard, Padding = new Padding(4), Visible = false };
            _logCard = logCard;
            logCard.Paint += PaintCardBorder;
            var logLabel = new Label
            {
                Text      = "Activity",
                Dock      = DockStyle.Top,
                Height    = 20,
                Font      = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                ForeColor = ColorText,
            };
            _txtActivityLog = new TextBox
            {
                Dock        = DockStyle.Fill,
                Multiline   = true,
                ReadOnly    = true,
                ScrollBars  = ScrollBars.Vertical,
                Font        = new Font("Consolas", 9f, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor   = ColorText,
                BackColor   = ColorInputBg,
                BorderStyle = BorderStyle.FixedSingle,
                TabStop     = false,
                WordWrap    = false,
            };
            logCard.Controls.Add(_txtActivityLog);
            logCard.Controls.Add(logLabel);

            outer.Controls.Add(queueCard, 0, 0);
            outer.Controls.Add(logCard, 0, 1);
            return outer;
        }

        // ── Load ──────────────────────────────────────────────────────────────

        private async void MainForm_Load(object? sender, EventArgs e)
        {
            _notifier ??= new DesktopNotifier(TryGetAppIcon());
            AppLogger.Info("=== Scanner Station starting ===");
            AppLogger.Info($"App version: {AppVersion.GetInformationalVersion()}  ({AppVersion.GetDisplayLabel()})");
            AppLogger.Info($"Machine={Environment.MachineName}  User={Environment.UserName}  " +
                           $"OS={Environment.OSVersion}");
            SetStatus("Loading settings…", true);
            try
            {
                // 1. Storage path – use saved path, or silently fall back to default
                _storagePath = StoragePathDialog.GetSavedPath() ?? "";
                if (string.IsNullOrEmpty(_storagePath))
                {
                    // Auto-select default path on first run (no blocking dialog)
                    _storagePath = Path.Combine(@"C:\ScanOutput");
                    try { Directory.CreateDirectory(_storagePath); }
                    catch
                    {
                        // Fallback to Desktop if C:\ is not writable
                        _storagePath = Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                            "ScanOutput");
                        Directory.CreateDirectory(_storagePath);
                    }
                    StoragePathDialog.SaveDefaultPath(_storagePath);
                    SetStatus($"Default storage: {_storagePath}", false);
                }

                // 2. Operator label
                var user = _api.CurrentUser;
                if (user != null)
                    _lblOperator.Text = $"  {user.FullName}  |  {user.RoleName}";

                // 3. Load settings (exams, papers, templates from API)
                try
                {
                    _settings = await _api.GetScanSettingsAsync();
                    LoadExams();
                    LoadTemplates();
                }
                catch (Exception ex)
                {
                    SetStatus($"Settings unavailable: {ex.Message}", false, isError: true);
                }

                // 4. Auto-select workstation
                try
                {
                    _myWorkstation = await _api.GetMyWorkstationAsync();
                    ApplyWorkstation();
                }
                catch
                {
                    ApplyWorkstation(); // shows "no workstation assigned"
                }

                // 5. Hardware scanners
                try { LoadScanners(); }
                catch { SetStatus("Could not enumerate scanners", false, isWarning: true); }

                // 6. Server + scanner connectivity polling
                StartConnectivityPolling();

                // 7. Local queue (always initialize — works offline)
                _queue = new LocalQueueService(_storagePath, _api);
                WireQueueStatus(_queue);
                SyncQueueUploadFallback();
                _queue.StartBackgroundUpload();
                RefreshQueueView();

                SyncLeftConfigColumnWidth();
                SetStatus("Ready", false);
            }
            catch (Exception ex)
            {
                SetStatus($"Startup error: {ex.Message}", false, isError: true);
                MessageBox.Show($"Startup error:\n{ex.Message}", "Warning",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                // Still allow the form to remain open — queue is initialized above
            }
        }

        private void LoadExams()
        {
            _cboExam.Items.Clear();
            if (_settings?.Exams == null) return;
            foreach (var e in _settings.Exams)
                _cboExam.Items.Add(e);
            if (_cboExam.Items.Count > 0) _cboExam.SelectedIndex = 0;
            SyncQueueUploadFallback();
        }

        private void CboExam_Changed(object? sender, EventArgs e)
        {
            _cboPaper.Items.Clear();
            if (_cboExam.SelectedItem is not ExamInfo exam) return;
            foreach (var p in _settings?.Papers.Where(p => p.ExamID == exam.ExamID) ?? Enumerable.Empty<PaperInfo>())
                _cboPaper.Items.Add(p);
            if (_cboPaper.Items.Count > 0) _cboPaper.SelectedIndex = 0;
            SyncQueueUploadFallback();
        }

        /// <summary>So background upload and retry use the exam/paper currently selected in the UI when queue rows lack IDs.</summary>
        private void SyncQueueUploadFallback()
        {
            if (_queue == null) return;
            var examId  = (_cboExam.SelectedItem  as ExamInfo)?.ExamID  ?? 0;
            var paperId = (_cboPaper.SelectedItem as PaperInfo)?.PaperID ?? 0;
            _queue.SetUploadFallback(examId, paperId);
        }

        private static Icon? TryGetAppIcon()
        {
            try
            {
                var p = Application.ExecutablePath;
                if (!string.IsNullOrEmpty(p) && File.Exists(p))
                    return Icon.ExtractAssociatedIcon(p);
            }
            catch { /* ignore */ }
            return null;
        }

        private void WireQueueStatus(LocalQueueService queue)
        {
            queue.StatusChanged += OnQueueStatusChanged;
        }

        private void OnQueueStatusChanged(string id, string status, string? err)
        {
            if (IsDisposed) return;
            BeginInvoke(() =>
            {
                AppendActivity($"Queue: {id} → {status}" + (string.IsNullOrEmpty(err) ? "" : $" — {err}"));
                RefreshQueueView();
                if (status == "Uploaded")
                    _notifier?.Show("Upload complete", $"{id} was sent to the server.", ToolTipIcon.Info);
                else if (status == "Failed")
                {
                    var detail = string.IsNullOrWhiteSpace(err) ? "See Activity log for details." : err;
                    if (detail.Length > 400) detail = detail[..397] + "…";
                    _notifier?.Show("Upload failed", $"{id}: {detail}", ToolTipIcon.Error);
                }
            });
        }

        private void LoadTemplates()
        {
            _cboTemplate.Items.Clear();
            if (_settings?.Templates == null) return;
            foreach (var t in _settings.Templates)
                _cboTemplate.Items.Add(t);
            if (_cboTemplate.Items.Count > 0)
            {
                _cboTemplate.SelectedIndex = 0;
                CboTemplate_Changed(null, EventArgs.Empty); // populate info label immediately
            }
        }

        private void CboTemplate_Changed(object? sender, EventArgs e)
        {
            _selectedTemplate = _cboTemplate.SelectedItem as ScanTemplate;
            if (_selectedTemplate is ScanTemplate t)
            {
                RefreshTemplateDetailView();
                SetStatus($"Template: {t.TemplateName}", false);
            }
            else
            {
                _txtTemplateDetail.Text = "Select a template above";
            }
        }

        private void RefreshTemplateDetailView()
        {
            if (_selectedTemplate is not ScanTemplate t)
            {
                _txtTemplateDetail.Text = "Select a template above";
                return;
            }

            _txtTemplateDetail.Text = TemplateDetailFormatter.BuildDetailText(t, _chkDeskewTrim.Checked);
        }

        /// <summary>Thread-safe activity log (caps line count).</summary>
        public void AppendActivity(string line)
        {
            var text = $"{DateTime.Now:HH:mm:ss}  {line}";
            void Append()
            {
                if (_txtActivityLog == null) return;
                var lines = _txtActivityLog.Text.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
                var list = lines.Where(s => !string.IsNullOrEmpty(s)).ToList();
                list.Add(text);
                while (list.Count > ActivityLogMaxLines)
                    list.RemoveAt(0);
                _txtActivityLog.Text = string.Join(Environment.NewLine, list);
                _txtActivityLog.SelectionStart = _txtActivityLog.Text.Length;
                _txtActivityLog.ScrollToCaret();
            }

            if (InvokeRequired)
                BeginInvoke(Append);
            else
                Append();
        }

        private void StartConnectivityPolling()
        {
            bool hasApiUrl = !string.IsNullOrWhiteSpace(_api.BaseUrl);
            _lblServerStatus.Visible = hasApiUrl;

            _ = CheckConnectivityAsync();
            _connectivityTimer = new System.Windows.Forms.Timer { Interval = 30_000 };
            _connectivityTimer.Tick += async (_, _) => await CheckConnectivityAsync();
            _connectivityTimer.Start();
        }

        private async Task CheckConnectivityAsync()
        {
            try
            {
                bool serverOk = await _api.PingAsync();
                _lblServerStatus.Text      = serverOk ? "● Server: Online" : "● Server: Offline";
                _lblServerStatus.ForeColor = serverOk ? Color.FromArgb(80, 220, 120) : Color.FromArgb(255, 90, 90);
            }
            catch
            {
                _lblServerStatus.Text      = "● Server: Offline";
                _lblServerStatus.ForeColor = Color.FromArgb(255, 90, 90);
            }

            try
            {
                bool scannerOk = _scanner.IsConnected();
                _lblScannerStatus.Text      = scannerOk ? "● Scanner: Ready" : "● Scanner: None";
                _lblScannerStatus.ForeColor = scannerOk ? Color.FromArgb(80, 220, 120) : Color.FromArgb(255, 180, 60);
            }
            catch
            {
                _lblScannerStatus.Text      = "● Scanner: Error";
                _lblScannerStatus.ForeColor = Color.FromArgb(255, 90, 90);
            }
        }

        private void ApplyWorkstation()
        {
            if (_myWorkstation == null)
            {
                _lblWorkstationCode.Text = "—";
                _lblWorkstationName.Text = "No workstation assigned";
                _lblWorkstationCode.ForeColor = ColorDanger;
                _lblWorkstationName.ForeColor = ColorMuted;
                return;
            }

            _lblWorkstationCode.Text = (_myWorkstation.WorkstationCode ?? "—").Trim();
            _lblWorkstationName.Text = string.IsNullOrWhiteSpace(_myWorkstation.WorkstationName)
                ? "Workstation"
                : _myWorkstation.WorkstationName.Trim();
            _lblWorkstationCode.ForeColor = ColorPrimary;
            _lblWorkstationName.ForeColor = ColorMuted;

            var driverType = _myWorkstation.DriverType ?? "WIA";
            _lblDriverMode.Text = $"Driver: {driverType}  |  Printer: {_myWorkstation.PrinterProfileName ?? "Default"}";

            // Swap scanner implementation if TWAIN printer profile is assigned
            if (driverType.Equals("TWAIN", StringComparison.OrdinalIgnoreCase)
                && _myWorkstation.PrinterProfileID.HasValue)
            {
                var profile = _settings?.PrinterProfiles
                    .FirstOrDefault(p => p.ProfileID == _myWorkstation.PrinterProfileID.Value);

                _scanner = new TwainScannerService(profile);
                _lblDriverMode.ForeColor = Color.FromArgb(160, 100, 20);
            }
            else
            {
                _scanner = new ScannerService();
                _lblDriverMode.ForeColor = ColorAccent;
            }

            _chkTwainUi.Visible = _scanner is TwainScannerService;
            SyncTwainScannerUiFlag();

            // Update form title
            Text = $"Scanner — {_myWorkstation.WorkstationCode}";
        }

        private void SyncTwainScannerUiFlag()
        {
            if (_scanner is TwainScannerService tw)
                tw.UseScannerUi = _chkTwainUi.Checked;
        }

        private void LoadScanners()
        {
            _cboScanner.Items.Clear();
            var scanners = _scanner.GetAvailableScannersPreferPhysical();
            foreach (var name in scanners)
                _cboScanner.Items.Add(name);

            if (_cboScanner.Items.Count > 0)
            {
                // Try to restore the previously saved default scanner
                var savedDefault = StoragePathDialog.GetSavedScanner();
                var matchIdx = savedDefault != null
                    ? _cboScanner.Items.Cast<string>()
                        .ToList().FindIndex(s => s.Equals(savedDefault, StringComparison.OrdinalIgnoreCase))
                    : -1;
                _cboScanner.SelectedIndex = matchIdx >= 0 ? matchIdx : 0;
                SetStatus($"{scanners.Count} scanner(s) found", false);
                _lblScannerStatus.Text      = "● Scanner: Ready";
                _lblScannerStatus.ForeColor = Color.FromArgb(80, 220, 120);
            }
            else
            {
                SetStatus("No scanners detected. Connect a scanner and click ⟳", false, isWarning: true);
                _lblScannerStatus.Text      = "● Scanner: None";
                _lblScannerStatus.ForeColor = Color.FromArgb(255, 180, 60);
            }
        }

        private void BtnChangePath_Click(object? sender, EventArgs e)
        {
            using var dlg = new StoragePathDialog();
            if (dlg.ShowDialog(this) == DialogResult.OK)
            {
                _storagePath = dlg.SelectedPath;
                // Re-init queue with new path
                _queue?.StopBackgroundUpload();
                _queue?.Dispose();
                _queue = new LocalQueueService(_storagePath, _api);
                WireQueueStatus(_queue);
                SyncQueueUploadFallback();
                _queue.StartBackgroundUpload();
                RefreshQueueView();
                SetStatus($"Storage path changed to: {_storagePath}", false);
            }
        }

        // ── Scan flow ─────────────────────────────────────────────────────────

        private static void WriteFinalJpegAtomic(Bitmap bmp, string finalPath, int quality)
        {
            var tmp = finalPath + ".tmp.jpg";
            ImageHelper.SaveAsJpeg(bmp, tmp, quality);
            if (File.Exists(finalPath))
                File.Delete(finalPath);
            File.Move(tmp, finalPath);
        }

        /// <summary>
        /// Deletes a folder with up to 3 retries (500ms apart) to handle lingering file locks
        /// from GDI+ Bitmap or anti-virus scanners.
        /// </summary>
        private static void TryDeleteFolderWithRetry(string folder)
        {
            if (!Directory.Exists(folder)) return;
            for (int attempt = 0; attempt < 3; attempt++)
            {
                try
                {
                    if (attempt > 0) Thread.Sleep(500);
                    Directory.Delete(folder, true);
                    return;
                }
                catch
                {
                    // retry
                }
            }
            AppLogger.Warn($"Could not delete folder after 3 attempts: {folder}");
        }

        private static void TryDeleteRawJpegs(string folder, int pageCount)
        {
            for (int i = 1; i <= pageCount; i++)
            {
                try
                {
                    var p = Path.Combine(folder, $"page_{i:D3}_raw.jpg");
                    if (File.Exists(p))
                        File.Delete(p);
                }
                catch
                {
                    // ignore
                }
            }
        }

        /// <summary>Shows raw (unprocessed) scan in the page list and preview immediately on arrival.</summary>
        private void AddRawPageToUi(int pageNum, Bitmap rawBmp)
        {
            var sp = new ScannedPage
            {
                PageNumber = pageNum,
                FilePath   = "",
                Hash       = null,
                IsPage1    = pageNum == 1,
            };
            _currentPages.Add(sp);

            var thumb = CreateThumbnail(rawBmp, _pageImages.ImageSize);
            _pageImages.Images.Add(thumb);
            var item = new ListViewItem($"P{pageNum}", _pageImages.Images.Count - 1)
            {
                Tag       = pageNum - 1,
                ForeColor = pageNum == 1 ? Color.White : ColorText,
                BackColor = pageNum == 1 ? ColorAccent : Color.Transparent,
                Font      = pageNum == 1 ? new Font("Segoe UI", 8, FontStyle.Bold) : _lvPages.Font,
            };
            _lvPages.Items.Add(item);

            try { _picPreview.Image?.Dispose(); } catch { }
            _picPreview.Image = (Bitmap)rawBmp.Clone();
            SetStatus($"Page {pageNum} scanned (processing…)", true);
            UpdateScanWorkspaceLabels();
        }

        /// <summary>Replaces the thumbnail and preview with the processed (deskewed/trimmed) image.</summary>
        private void UpdateProcessedPageInUi(int pageNum, string finalPath, string pageHash)
        {
            var sp = _currentPages.FirstOrDefault(p => p.PageNumber == pageNum);
            if (sp != null)
            {
                sp.FilePath = finalPath;
                sp.Hash     = pageHash;
            }

            if (string.IsNullOrWhiteSpace(finalPath) || !File.Exists(finalPath))
                return;

            Bitmap? uiBmp = null;
            try
            {
                // Load via MemoryStream so the file lock is released immediately
                var bytes = File.ReadAllBytes(finalPath);
                using var ms = new System.IO.MemoryStream(bytes);
                uiBmp = new Bitmap(ms);
                int imgIdx = pageNum - 1;
                if (imgIdx >= 0 && imgIdx < _pageImages.Images.Count)
                {
                    _pageImages.Images[imgIdx]?.Dispose();
                    _pageImages.Images[imgIdx] = CreateThumbnail(uiBmp, _pageImages.ImageSize);
                    _lvPages.Invalidate();
                }

                bool isSelected = _lvPages.SelectedItems.Count > 0
                    && _lvPages.SelectedItems[0].Tag is int selIdx && selIdx == pageNum - 1;
                bool isLast = pageNum == _currentPages.Count;
                if (isSelected || isLast)
                {
                    try { _picPreview.Image?.Dispose(); } catch { }
                    _picPreview.Image = (Bitmap)uiBmp.Clone();
                }
            }
            finally
            {
                uiBmp?.Dispose();
            }

            SetStatus($"Page {pageNum} processed ({_currentPages.Count} total)", true);
            UpdateScanWorkspaceLabels();
        }

        /// <summary>Background pipeline: raw JPEG, optional deskew/trim, decode, ordered UI flush.</summary>
        private void RunPagePipeline(
            Bitmap sourceBmp,
            int pageNum,
            string folder,
            ScanTemplate tmpl,
            bool deskewTrim,
            SemaphoreSlim sem,
            CancellationToken ct,
            int sessionId)
        {
            sem.Wait();
            var sw = Stopwatch.StartNew();
            try
            {
                ct.ThrowIfCancellationRequested();
                string rawPath = Path.Combine(folder, $"page_{pageNum:D3}_raw.jpg");
                string finalPath = Path.Combine(folder, $"page_{pageNum:D3}.jpg");

                int srcW = sourceBmp.Width, srcH = sourceBmp.Height;
                var srcFmt = sourceBmp.PixelFormat;
                string deskewLabel = deskewTrim ? "deskew + trim" : "copy";
                BeginInvoke(() => AppendActivity($"P{pageNum}: saving raw JPEG ({srcW}x{srcH} {srcFmt})…"));
                try
                {
                    ct.ThrowIfCancellationRequested();
                    ImageHelper.SaveAsJpeg(sourceBmp, rawPath, tmpl.JpegQuality);
                    var rawSize = new FileInfo(rawPath).Length / 1024;
                    BeginInvoke(() => AppendActivity($"P{pageNum}: raw JPEG saved ({rawSize} KB)"));
                }
                catch (Exception ex)
                {
                    AppLogger.Error($"P{pageNum}: raw save failed: {ex.Message}", ex);
                    BeginInvoke(() => AppendActivity($"P{pageNum}: ERROR raw save failed — {ex.Message}"));
                    return;
                }

                _pauseEvent.Wait(CancellationToken.None);

                BeginInvoke(() => AppendActivity($"P{pageNum}: {deskewLabel} started…"));
                try
                {
                    ct.ThrowIfCancellationRequested();
                    if (deskewTrim)
                    {
                        using var processed = ImageHelper.AutoTrimAndDeskew(sourceBmp, true);
                        int pw = processed.Width, ph = processed.Height;
                        WriteFinalJpegAtomic(processed, finalPath, tmpl.JpegQuality);
                        BeginInvoke(() => AppendActivity($"P{pageNum}: deskew OK → {pw}x{ph}"));
                    }
                    else
                    {
                        WriteFinalJpegAtomic(sourceBmp, finalPath, tmpl.JpegQuality);
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Error($"P{pageNum}: deskew/save failed: {ex.Message}", ex);
                    BeginInvoke(() => AppendActivity($"P{pageNum}: WARN deskew failed — {ex.Message}; using raw copy"));
                    try { WriteFinalJpegAtomic(sourceBmp, finalPath, tmpl.JpegQuality); }
                    catch (Exception ex2)
                    {
                        AppLogger.Error($"P{pageNum}: fallback save failed: {ex2.Message}", ex2);
                        BeginInvoke(() => AppendActivity($"P{pageNum}: ERROR fallback save failed — {ex2.Message}"));
                        return;
                    }
                }

                string hash = "";
                if (File.Exists(finalPath))
                {
                    try { hash = HashHelper.ComputeSha256(finalPath); }
                    catch (Exception ex)
                    {
                        AppLogger.Error($"P{pageNum}: hash failed: {ex.Message}", ex);
                    }
                }

                var finalSize = File.Exists(finalPath) ? new FileInfo(finalPath).Length / 1024 : 0;
                sw.Stop();
                ct.ThrowIfCancellationRequested();
                BeginInvoke(() =>
                {
                    if (!_isScanning || _scanSessionId != sessionId || _cancelRequested) return;
                    UpdateProcessedPageInUi(pageNum, finalPath, hash);
                    AppendActivity($"P{pageNum}: processed OK ({finalSize} KB, {sw.ElapsedMilliseconds} ms)");
                });
            }
            catch (OperationCanceledException)
            {
                BeginInvoke(() => AppendActivity($"P{pageNum}: processing cancelled"));
            }
            catch (Exception ex)
            {
                AppLogger.Error($"P{pageNum}: pipeline unexpected error: {ex.Message}", ex);
                BeginInvoke(() => AppendActivity($"P{pageNum}: ERROR pipeline — {ex.Message}"));
            }
            finally
            {
                try { sourceBmp.Dispose(); }
                catch (Exception ex) { AppLogger.Error($"P{pageNum}: dispose error: {ex.Message}", ex); }
                sem.Release();
            }
        }

        private async void BtnScan_Click(object? sender, EventArgs e)
        {
            if (_cboScanner.SelectedItem == null)
            {
                MessageBox.Show("Please select a scanner.", "No Scanner",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (_selectedTemplate == null && _cboTemplate.Items.Count == 0)
            {
                MessageBox.Show("No scan templates available. Configure templates in the web admin first.",
                    "No Templates", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var template = _selectedTemplate ?? (_cboTemplate.SelectedItem as ScanTemplate)!;
            if (template == null) { MessageBox.Show("Please select a scan template.", "Required"); return; }

            // Build effective template with local overrides
            var effectiveTemplate = ScanTemplate.CloneFrom(template);
            if (!ValidateMandatoryTemplateZones(effectiveTemplate, out var zoneError))
            {
                SetStatus("Scan blocked — template is missing required barcode zones", false, isError: true);
                MessageBox.Show(zoneError, "Template configuration error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                AppLogger.Error($"Template '{effectiveTemplate.TemplateName}' rejected: {zoneError}");
                return;
            }

            // Derive scan source from server-configured template (no local dropdown)
            var scanSrc = effectiveTemplate.DuplexMode.Equals("Duplex", StringComparison.OrdinalIgnoreCase)
                ? ScanSource.FeederDuplex
                : ScanSource.FeederSimplex;

            var scannerName = _cboScanner.SelectedItem.ToString()!;
            var driverName = _scanner.GetType().Name;

            AppLogger.Info($"BtnScan_Click: scanner={scannerName}  template={effectiveTemplate.TemplateName}  " +
                           $"dpi={effectiveTemplate.DPI}  duplex={effectiveTemplate.DuplexMode}  " +
                           $"pages={effectiveTemplate.PageCount}  source={scanSrc}");
            AppLogger.Info($"ScanColourDiag colorMode={effectiveTemplate.ColorMode} driver={driverName} " +
                           $"workstationDriver={_myWorkstation?.DriverType ?? "n/a"} deskewTrim={_chkDeskewTrim.Checked}");

            // UI: enter scanning state
            _cancelRequested = false;
            int sessionId = Interlocked.Increment(ref _scanSessionId);
            _currentPages.Clear();
            _lvPages.Items.Clear();
            _pageImages.Images.Clear();
            _picPreview.Image = null;
            UpdateScanWorkspaceLabels();

            _scanCts = new CancellationTokenSource();
            EnterScanningState();
            SetStatus($"Scanning — {effectiveTemplate.TemplateName}…", true);
            var scanSessionStarted = DateTime.Now;

            var pendingFolder = BuildBookletFolder("PENDING", effectiveTemplate);
            Directory.CreateDirectory(pendingFolder);

            // Allow some overlap while bounding memory (full-page 300 dpi bitmaps per worker).
            int parallel = Math.Max(2, Math.Min(12, Environment.ProcessorCount * 2));
            var pipelineSem = new SemaphoreSlim(parallel);
            var pageTasks = new List<Task>();
            bool deskewTrim = _chkDeskewTrim.Checked;
            int pageCounter = 0;

            AppendActivity($"Scan started — {effectiveTemplate.TemplateName} ({effectiveTemplate.PageCount} pp, {effectiveTemplate.DPI} DPI, {scanSrc})");
            AppendActivity($"  Scanner: {scannerName} ({driverName}), deskew={deskewTrim}, parallel workers={parallel}");
            AppendActivity($"  Barcode start page: {effectiveTemplate.BarcodeStartPage}, zones: {effectiveTemplate.BarcodeZonesJson ?? "(none)"}");
            AppendActivity($"  Output folder: {pendingFolder}");

            var progress = new Progress<Bitmap>(bmp =>
            {
                int pageNum = ++pageCounter;
                if (pageNum == 1)
                {
                    try
                    {
                        int bpp = System.Drawing.Image.GetPixelFormatSize(bmp.PixelFormat);
                        AppLogger.Info($"ScanColourDiag firstPage pixelFormat={bmp.PixelFormat} bpp={bpp} " +
                                       $"w={bmp.Width} h={bmp.Height}");
                    }
                    catch
                    {
                        // ignore
                    }
                }

                Bitmap? clone = null;
                try
                {
                    clone = (Bitmap)bmp.Clone();
                }
                catch (Exception ex)
                {
                    AppLogger.Error($"P{pageNum}: clone bitmap failed: {ex.Message}", ex);
                    AppendActivity($"P{pageNum}: ERROR clone bitmap — {ex.Message}");
                    return;
                }

                try
                {
                    AddRawPageToUi(pageNum, bmp);
                }
                catch (Exception ex2)
                {
                    AppLogger.Error($"P{pageNum}: raw preview failed: {ex2.Message}", ex2);
                }

                var c = clone!;
                int n = pageNum;
                pageTasks.Add(Task.Run(() => RunPagePipeline(c, n, pendingFolder, effectiveTemplate, deskewTrim, pipelineSem, _scanCts!.Token, sessionId)));
                AppendActivity($"P{pageNum}: scan received, queued for processing");
                SetStatus($"Scanning page {pageNum}…", true);
            });

            var scanSw = Stopwatch.StartNew();
            try
            {
                var bitmaps = await _scanner.ScanBookletAsync(
                    scannerName, effectiveTemplate, scanSrc, _scanCts.Token, progress);
                scanSw.Stop();

                if (bitmaps.Count == 0)
                {
                    try
                    {
                        if (Directory.Exists(pendingFolder))
                            TryDeleteFolderWithRetry(pendingFolder);
                    }
                    catch
                    {
                        // ignore
                    }

                    SetStatus("No pages scanned — feeder may be empty", false, isWarning: true);
                    AppendActivity("Scan finished — no pages.");
                    return;
                }

                if (pageCounter < bitmaps.Count)
                {
                    AppendActivity($"Warning: progress reported {pageCounter} pages, buffer has {bitmaps.Count} — processing remainder from memory.");
                    for (int i = pageCounter; i < bitmaps.Count; i++)
                    {
                        Bitmap? b = null;
                        int page1 = i + 1;
                        try
                        {
                            b = (Bitmap)bitmaps[i].Clone();
                        }
                        catch
                        {
                            continue;
                        }

                        // Add raw preview for catch-up pages
                        try { AddRawPageToUi(page1, bitmaps[i]); } catch { }

                        int n = page1;
                        var bb = b;
                        pageTasks.Add(Task.Run(() => RunPagePipeline(bb, n, pendingFolder, effectiveTemplate, deskewTrim, pipelineSem!, _scanCts!.Token, sessionId)));
                    }
                }

                var processSw = Stopwatch.StartNew();
                AppendActivity($"Waiting for {pageTasks.Count} deskew tasks to finish…");
                await Task.WhenAll(pageTasks);
                AppendActivity($"Pipeline: all {bitmaps.Count} pages deskewed + saved ({scanSw.Elapsed.TotalSeconds:0.0}s scan, {processSw.Elapsed.TotalSeconds:0.0}s process so far)");

                // ── Parallel barcode reading (each thread gets its own BarcodeService) ──
                SetStatus($"Reading barcodes in parallel…", true);

                int failedAtPage = 0;
                var ct = _scanCts!.Token;
                int barcodeStart = effectiveTemplate.BarcodeStartPage;
                string? zonesJson = effectiveTemplate.BarcodeZonesJson;
                int totalPages = bitmaps.Count;
                bool useServerBarcode = _serverBarcode.Enabled;
                // Local ZXing is CPU-bound — keep a small pool. Server API is I/O-bound; a low cap
                // serializes dozens of HTTP posts and inflates per-page wall time (scanner log: tail pages 10–40s).
                int maxWorkers = useServerBarcode
                    ? Math.Clamp(totalPages, 12, 32)
                    : Math.Clamp(Environment.ProcessorCount, 2, 6);
                AppendActivity($"Barcode scan: starting parallel read ({maxWorkers} workers)…");
                AppendActivity($"Barcode provider: {(useServerBarcode ? $"server ({_serverBarcode.BaseUrl})" : "local (inbuilt)")}");

                await Task.Run(() =>
                {
                    // ZXing readers are created per-call — share the single _barcode instance
                    try
                    {
                        var opts = new ParallelOptions
                        {
                            MaxDegreeOfParallelism = maxWorkers,
                            CancellationToken = ct,
                        };

                        Parallel.For(1, totalPages + 1, opts, (pg, loopState) =>
                        {
                            if (_barcodeFailureDetected || ct.IsCancellationRequested) { loopState.Stop(); return; }

                            string fpFinal = Path.Combine(pendingFolder, $"page_{pg:D3}.jpg");
                            string fpRaw   = Path.Combine(pendingFolder, $"page_{pg:D3}_raw.jpg");
                            int pageNum = pg;

                            if (!File.Exists(fpFinal))
                            {
                                AppLogger.Warn($"P{pageNum}: final JPEG missing at {fpFinal}");
                                BeginInvoke(() => AppendActivity($"P{pageNum}: WARN final JPEG not found — skipped"));
                                return;
                            }

                            var bc = _barcode;
                            var sbc = _serverBarcode;
                            var pageSw = Stopwatch.StartNew();
                            try
                            {
                                string? lin = null, qr = null;
                                string? footer = null;
                                string diagInfo = "";

                                // Load bitmap via MemoryStream to release the file lock immediately.
                                // new Bitmap(filePath) keeps the file locked until the bitmap is disposed.
                                int decW = 0, decH = 0;
                                try
                                {
                                    using var decBmp = new Bitmap(fpFinal);
                                    decW = decBmp.Width; decH = decBmp.Height;

                                    if (pageNum < barcodeStart)
                                    {
                                        try
                                        {
                                            if (useServerBarcode)
                                            {
                                                var srv = sbc.ReadLinearAndQrParallelAsync(decBmp, ct).GetAwaiter().GetResult();
                                                lin = srv.LinearText;
                                                qr = srv.QrText;
                                                if (!string.IsNullOrWhiteSpace(srv.Diag))
                                                    diagInfo = $"[server pass1 {decW}x{decH}] {srv.Diag}";
                                            }
                                            else
                                            {
                                                (lin, qr) = bc.ReadLinearAndQrParallel(decBmp);
                                            }
                                        }
                                        catch (Exception ex) { AppLogger.Error($"P{pageNum}: ReadLinearAndQr: {ex.Message}", ex); }
                                    }
                                    else
                                    {
                                        (string? r1, string d1) = useServerBarcode
                                            ? sbc.ReadPageSerialOrFooterWithDiagAsync(decBmp, pageNum, barcodeStart, zonesJson, ct).GetAwaiter().GetResult()
                                            : bc.ReadPageSerialOrFooterWithDiag(decBmp, pageNum, barcodeStart, zonesJson);
                                        footer = r1;
                                        diagInfo = useServerBarcode
                                            ? $"[server pass1 {decW}x{decH}] {d1}"
                                            : $"[pass1 {decW}x{decH}] {d1}";
                                    }
                                }
                                catch (Exception ex)
                                {
                                    diagInfo += $"\nerror loading final JPEG: {ex.Message}";
                                    AppLogger.Error($"P{pageNum}: load final JPEG for barcode failed: {ex.Message}", ex);
                                }

                                if (pageNum >= barcodeStart && string.IsNullOrEmpty(footer) && File.Exists(fpRaw))
                                {
                                    BeginInvoke(() => AppendActivity($"P{pageNum}: barcode retry (raw)…"));
                                    try
                                    {
                                        using var rawBmp = new Bitmap(fpRaw);
                                        (string? r2, string d2) = useServerBarcode
                                            ? sbc.ReadPageSerialOrFooterWithDiagAsync(rawBmp, pageNum, barcodeStart, zonesJson, ct).GetAwaiter().GetResult()
                                            : bc.ReadPageSerialOrFooterWithDiag(rawBmp, pageNum, barcodeStart, zonesJson);
                                        footer = r2;
                                        diagInfo += useServerBarcode
                                            ? $"\n[server pass2-raw] {d2}"
                                            : $"\n[pass2-raw] {d2}";
                                    }
                                    catch (Exception ex)
                                    {
                                        diagInfo += $"\n[pass2-raw] error: {ex.Message}";
                                        AppLogger.Error($"P{pageNum}: pass2: {ex.Message}", ex);
                                    }
                                }

                                _pageBarcodesRealtime[pageNum] = footer;
                                pageSw.Stop();

                                string barcodeDisplay = pageNum >= barcodeStart ? (footer ?? "—") : (lin ?? qr ?? "—");
                                string logLine = $"P{pageNum}: barcode={barcodeDisplay} ({pageSw.ElapsedMilliseconds} ms)";
                                AppLogger.Info(logLine);
                                BeginInvoke(() => AppendActivity(logLine));

                                if (pageNum >= barcodeStart)
                                {
                                    bool ok = !string.IsNullOrEmpty(footer);
                                    string tip = ok ? $"{footer}\n---\n{diagInfo}" : $"FAILED\n---\n{diagInfo}";
                                    BeginInvoke(() => MarkPageBarcodeStatus(pageNum, ok, tip));

                                    if (!ok)
                                    {
                                        Interlocked.CompareExchange(ref failedAtPage, pageNum, 0);
                                        _barcodeFailureDetected = true;
                                        AppLogger.Warn(
                                            $"P{pageNum}: *** BARCODE FAILED (key={PageSerialZoneHelper.PrimaryZoneKey}) ***\n{diagInfo}");
                                        BeginInvoke(() => AppendActivity($"P{pageNum}: *** BARCODE MISSING / UNREADABLE ***"));
                                        loopState.Stop();
                                    }
                                }
                                else
                                {
                                    string tip = lin ?? qr ?? "(cover page)";
                                    BeginInvoke(() => MarkPageBarcodeStatus(pageNum, true, tip));
                                }
                            }
                            catch (Exception ex)
                            {
                                AppLogger.Error($"P{pageNum}: barcode exception: {ex.Message}", ex);
                                BeginInvoke(() => AppendActivity($"P{pageNum}: ERROR barcode — {ex.Message}"));
                                if (pageNum >= barcodeStart)
                                {
                                    _pageBarcodesRealtime[pageNum] = null;
                                    Interlocked.CompareExchange(ref failedAtPage, pageNum, 0);
                                    _barcodeFailureDetected = true;
                                    BeginInvoke(() => MarkPageBarcodeStatus(pageNum, false, $"exception: {ex.Message}"));
                                    loopState.Stop();
                                }
                            }
                        });
                    }
                    catch (OperationCanceledException) { }
                    finally { }
                });

                // Handle barcode failure or cancellation AFTER the loop exits (on UI thread)
                if (ct.IsCancellationRequested)
                {
                    AppendActivity("Barcode reading cancelled by user");
                    throw new OperationCanceledException(ct);
                }

                if (_barcodeFailureDetected)
                {
                    processSw.Stop();
                    AppendActivity($"Barcode scan stopped at page {failedAtPage}");

                    try
                    {
                        if (Directory.Exists(pendingFolder))
                            TryDeleteFolderWithRetry(pendingFolder);
                    }
                    catch { }

                    _currentPages.Clear();
                    _lvPages.Items.Clear();
                    _pageImages.Images.Clear();
                    try { _picPreview.Image?.Dispose(); } catch { }
                    _picPreview.Image = null;
                    _picPreview.BackColor = ColorInputBg;
                    _pageBarcodesRealtime.Clear();

                    MessageBox.Show(
                        $"Scan Failed: Barcode missing / unreadable at page {failedAtPage}.\n\n" +
                        $"Action:\nPlease re-scan the entire document.",
                        "Scan Failed — Barcode Error",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);

                    _barcodeFailureDetected = false;
                    SetStatus("Ready — re-scan required", false, isWarning: true);
                    AppendActivity("Reset complete — ready for new scan");
                    return;
                }

                AppendActivity($"Barcode scan complete for {bitmaps.Count} pages");

                SetStatus($"Scan complete — validating sequence…", true);

                // ── STRICT barcode sequence validation (HARD STOP on failure) ──
                var validationError = ValidateBarcodeSequenceStrict(
                    bitmaps.Count, effectiveTemplate.BarcodeStartPage);
                if (validationError != null)
                {
                    processSw.Stop();
                    AppLogger.Error($"Barcode validation HARD STOP: {validationError}");
                    AppendActivity($"*** BARCODE VALIDATION FAILED ***\n{validationError}");

                    try
                    {
                        if (Directory.Exists(pendingFolder))
                            TryDeleteFolderWithRetry(pendingFolder);
                    }
                    catch { }

                    _currentPages.Clear();
                    _lvPages.Items.Clear();
                    _pageImages.Images.Clear();
                    try { _picPreview.Image?.Dispose(); } catch { }
                    _picPreview.Image = null;
                    _pageBarcodesRealtime.Clear();

                    MessageBox.Show(
                        $"Scan Failed: Barcode sequence error detected.\n\n" +
                        $"Reason:\n{validationError}\n\n" +
                        $"Action:\nPlease re-scan the entire document.",
                        "Scan Failed — Barcode Validation",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);

                    SetStatus("Scan failed — barcode validation error", false, isError: true);
                    return;
                }

                AppendActivity("Barcode sequence validated — OK");

                var pagesForZones = new List<Bitmap>();
                Dictionary<string, string> zoneMap;
                try
                {
                    for (int i = 1; i <= bitmaps.Count; i++)
                    {
                        var pth = Path.Combine(pendingFolder, $"page_{i:D3}.jpg");
                        if (!File.Exists(pth)) continue;
                        var b2 = File.ReadAllBytes(pth);
                        using var ms2 = new System.IO.MemoryStream(b2);
                        pagesForZones.Add(new Bitmap(ms2));
                    }

                    zoneMap = _barcode.DecodeTemplateZones(pagesForZones, effectiveTemplate.BarcodeZonesJson);
                }
                finally
                {
                    foreach (var b in pagesForZones)
                    {
                        try
                        {
                            b.Dispose();
                        }
                        catch
                        {
                            // ignore
                        }
                    }
                }

                var barcodeDetails = BarcodeDetails.Parse("");
                try
                {
                    string? rawBarcode = null;
                    if (zoneMap.TryGetValue("barcodefilename", out var zfn) && !string.IsNullOrWhiteSpace(zfn))
                        rawBarcode = zfn;
                    var p1 = Path.Combine(pendingFolder, "page_001.jpg");
                    if (rawBarcode == null && File.Exists(p1))
                    {
                        using var b1 = new Bitmap(p1);
                        rawBarcode = _barcode.ReadBarcode(b1);
                    }

                    if (rawBarcode == null && bitmaps.Count > 0)
                        rawBarcode = _barcode.ReadBarcode(bitmaps[0]);
                    barcodeDetails = BarcodeDetails.Parse(rawBarcode ?? "");
                }
                catch
                {
                    /* barcode decode failure is non-fatal */
                }

                var qcOverride = _txtQcRescanId.Text?.Trim();
                var ts = DateTime.Now.ToString("HHmmss");
                var bookletId = string.IsNullOrEmpty(qcOverride)
                    ? TemplateBookletNaming.BuildBookletId(effectiveTemplate, barcodeDetails, zoneMap, ts)
                    : qcOverride;
                var finalFolder = Path.Combine(_storagePath, "booklets", bookletId);
                Directory.CreateDirectory(Path.Combine(_storagePath, "booklets"));
                Directory.CreateDirectory(Path.GetDirectoryName(finalFolder)!);
                if (Directory.Exists(pendingFolder) && pendingFolder != finalFolder)
                {
                    Directory.Move(pendingFolder, finalFolder);
                    foreach (var sp in _currentPages)
                        sp.FilePath = sp.FilePath.Replace(pendingFolder, finalFolder);
                }

                TryDeleteRawJpegs(finalFolder, bitmaps.Count);

                processSw.Stop();
                AppendActivity(
                    $"Booklet verified: {bookletId} — scan {scanSw.Elapsed.TotalSeconds:0.0}s, process {processSw.Elapsed.TotalSeconds:0.0}s " +
                    $"(PDF + queue + upload in background)");

                var completedAt = DateTime.Now;
                var pageFiles = _currentPages.OrderBy(p => p.PageNumber).Select(p => p.FilePath).ToList();
                var pdfPath = Path.Combine(finalFolder, "booklet.pdf");
                var pdfJpeg = effectiveTemplate.PdfJpegQuality > 0 ? effectiveTemplate.PdfJpegQuality : 85;
                var pdfMaxDpi = effectiveTemplate.PdfMaxDpi;
                var pdfOptions = new PdfService.CompressionOptions(JpegQuality: pdfJpeg, MaxDpi: pdfMaxDpi);

                var pagesJson = JsonConvert.SerializeObject(_currentPages.OrderBy(p => p.PageNumber).Select(p => new PageData
                {
                    PageNumber       = p.PageNumber,
                    ImagePath        = p.FilePath,
                    PageHash         = p.Hash,
                    BarcodeData      = p.IsPage1 ? barcodeDetails.RawValue : null,
                    ValidationStatus = "Valid",
                    IsRoughPage      = 0,
                }).ToList());

                var record = new LocalBookletRecord
                {
                    BookletId          = bookletId,
                    ExamId             = (_cboExam.SelectedItem  as ExamInfo)?.ExamID  ?? 0,
                    PaperId            = (_cboPaper.SelectedItem as PaperInfo)?.PaperID ?? 0,
                    ExamCode           = barcodeDetails.ExamCode,
                    PaperCode          = barcodeDetails.PaperCode,
                    RollNo             = barcodeDetails.RollNo,
                    Serial             = barcodeDetails.Serial,
                    FolderPath         = finalFolder,
                    PagesJson          = pagesJson,
                    Status             = "Pending",
                    CreatedAt          = completedAt,
                    ScanStartedAt     = scanSessionStarted,
                    ScanCompletedAt   = completedAt,
                    TotalPagesExpected = effectiveTemplate.PageCount,
                    TotalPagesScanned  = bitmaps.Count,
                    WorkstationId      = _myWorkstation?.WorkstationID ?? 0,
                    LocationId         = _myWorkstation?.LocationID
                                         ?? _api.CurrentUser?.LocationId
                                         ?? 0,
                    UploadScheduleMode  = effectiveTemplate.UploadScheduleMode,
                    UploadScheduleParam = effectiveTemplate.UploadScheduleParam,
                    ScanDurationMs      = (int)Math.Min(int.MaxValue, scanSw.ElapsedMilliseconds),
                    ProcessingDurationMs  = (int)Math.Min(int.MaxValue, processSw.ElapsedMilliseconds),
                };

                BeginInvoke(() => _notifier?.Show(
                    "Scan complete",
                    $"Booklet {bookletId} — {bitmaps.Count} page(s).\n" +
                    "PDF, queue save, and server upload continue in the background.\n" +
                    "The workspace is cleared for the next booklet.",
                    ToolTipIcon.Info));

                if (!string.IsNullOrEmpty(qcOverride))
                    _txtQcRescanId.Clear();

                ClearScanWorkspaceForNextBooklet();
                SetStatus("Ready — scan another booklet", false);

                foreach (var bmp in bitmaps)
                {
                    try { bmp.Dispose(); }
                    catch (Exception dEx) { AppLogger.Warn($"Dispose scan bitmap: {dEx.Message}"); }
                }

                StartBookletFinalizeBackground(record, pageFiles, pdfPath, pdfOptions);
            }
            catch (OperationCanceledException)
                {
                    if (scanSw.IsRunning)
                        scanSw.Stop();
                    _pauseEvent.Set();
                    AppLogger.Warn("Scan cancelled (OperationCanceledException)");
                    AppendActivity("Scan cancelled");
                    try { await Task.WhenAll(pageTasks); } catch { }

                    if (_barcodeFailureDetected)
                    {
                        try
                        {
                            if (Directory.Exists(pendingFolder))
                                TryDeleteFolderWithRetry(pendingFolder);
                        }
                        catch { }
                    }
                    else
                    {
                        AppLogger.Warn("Scan cancelled by user.");
                        AppendActivity("Scan cancelled by user");
                        try
                        {
                            if (Directory.Exists(pendingFolder))
                                TryDeleteFolderWithRetry(pendingFolder);
                        }
                        catch { }

                        ClearScanWorkspaceForNextBooklet();
                        SetStatus("Scan cancelled", false, isWarning: true);
                    }
                }
                catch (Exception ex)
                {
                    _pauseEvent.Set();
                    try { await Task.WhenAll(pageTasks); } catch { }

                    AppLogger.Error($"Scan exception: {ex.Message}", ex);
                    SetStatus($"Scan error: {ex.Message}", false, isError: true);
                    var wiaHint = ex.Message.Contains("0x80004005", StringComparison.OrdinalIgnoreCase)
                        ? "\n\nWIA tip: generic scanner failure — check USB/cable, close other apps using the scanner, power-cycle the device, or try Windows Fax and Scan once to confirm the driver."
                        : "";
                    AppendActivity($"Scan error: {ex.Message}{wiaHint}");
                    MessageBox.Show($"Scanning failed:\n{ex.Message}{wiaHint}", "Error",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            finally
            {
                pipelineSem?.Dispose();
                ExitScanningState();
                _scanCts?.Dispose();
                _scanCts = null;
                _cancelRequested = false;
            }
        }

        // ── Scan flow state ──────────────────────────────────────────────────

        private void EnterScanningState()
        {
            _isScanning = true;
            _isPaused   = false;
            _barcodeFailureDetected = false;
            _pageBarcodesRealtime.Clear();
            _pauseEvent.Set();
            _picPreview.BackColor = ColorInputBg;

            _btnScan.Enabled     = false;
            _progressBar.Visible = true;

            var flowRow = Controls.Find("scanFlowRow", true);
            foreach (var c in flowRow) c.Visible = true;
            // Also search in panels
            foreach (Control ctl in Controls)
                ShowFlowRow(ctl, true);

            _btnPause.Text      = "⏸ PAUSE";
            _btnPause.BackColor = Color.FromArgb(230, 160, 30);
        }

        private void ExitScanningState()
        {
            _isScanning = false;
            _isPaused   = false;
            _pauseEvent.Set();

            _btnScan.Enabled     = true;
            _progressBar.Visible = false;

            foreach (Control ctl in Controls)
                ShowFlowRow(ctl, false);
        }

        private static void ShowFlowRow(Control parent, bool visible)
        {
            foreach (Control c in parent.Controls)
            {
                if (c.Tag is string tag && tag == "scanFlowRow")
                    c.Visible = visible;
                else
                    ShowFlowRow(c, visible);
            }
        }

        private void BtnPause_Click(object? sender, EventArgs e)
        {
            if (!_isScanning) return;

            if (_isPaused)
            {
                _isPaused = false;
                _pauseEvent.Set();
                _btnPause.Text      = "⏸ PAUSE";
                _btnPause.BackColor = Color.FromArgb(230, 160, 30);
                AppendActivity("Resumed — processing continues");
                SetStatus("Scanning — resumed", true);
            }
            else
            {
                _isPaused = true;
                _pauseEvent.Reset();
                _btnPause.Text      = "▶ RESUME";
                _btnPause.BackColor = Color.FromArgb(30, 140, 60);
                AppendActivity("Paused — waiting to resume…");
                SetStatus("Paused — click RESUME to continue", true);
            }
        }

        private void BtnCancel_Click(object? sender, EventArgs e)
        {
            if (!_isScanning) return;

            var confirm = MessageBox.Show(
                "Cancel current scan?\n\nThis will stop all scan/background processing for this session and clear scanned previews.",
                "Confirm Cancel",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (confirm != DialogResult.Yes) return;

            _cancelRequested = true;
            _scanCts?.Cancel();
            _pauseEvent.Set();
            ClearScanWorkspaceForNextBooklet();
            SetStatus("Scan cancelled", false, isWarning: true);
            AppendActivity("Cancel requested — stopping scan and clearing workspace…");
        }

        /// <summary>Clears page list, preview, and barcode UI so another booklet can be scanned.</summary>
        private void ClearScanWorkspaceForNextBooklet()
        {
            _currentPages.Clear();
            _lvPages.Items.Clear();
            _pageImages.Images.Clear();
            try { _picPreview.Image?.Dispose(); }
            catch { /* ignore */ }
            _picPreview.Image = null;
            _picPreview.BackColor = ColorInputBg;
            _pageBarcodesRealtime.Clear();
            UpdateScanWorkspaceLabels();
        }

        /// <summary>Builds PDF, persists queue row, and runs upload pass without blocking the UI thread.</summary>
        private void StartBookletFinalizeBackground(
            LocalBookletRecord record,
            List<string> pageFiles,
            string pdfPath,
            PdfService.CompressionOptions pdfOptions)
        {
            var queue = _queue;
            var id = record.BookletId;
            var paths = new List<string>(pageFiles);
            var pdf = pdfPath;
            var opts = pdfOptions;
            var rec = record;

            _ = Task.Run(async () =>
            {
                if (!IsDisposed)
                    BeginInvoke(() => AppendActivity($"[{id}] background: building PDF…"));
                try
                {
                    await Task.Run(() => PdfService.CreateBookletPdf(pdf, paths, opts)).ConfigureAwait(false);
                    if (File.Exists(pdf))
                    {
                        var kb = new FileInfo(pdf).Length / 1024;
                        AppLogger.Info($"booklet.pdf (background): {pdf} ({kb} KB)");
                        if (!IsDisposed)
                            BeginInvoke(() => AppendActivity($"[{id}] PDF ready ({kb} KB)"));
                    }
                    else
                    {
                        AppLogger.Error($"booklet.pdf missing after background build: {pdf}");
                        if (!IsDisposed)
                            BeginInvoke(() => AppendActivity($"[{id}] ERROR: booklet.pdf was not created"));
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Error($"Background PDF for {id}: {ex.Message}", ex);
                    if (!IsDisposed)
                        BeginInvoke(() => AppendActivity($"[{id}] ERROR PDF: {ex.Message}"));
                }

                try
                {
                    queue?.SaveToQueue(rec);
                    if (!IsDisposed)
                    {
                        BeginInvoke(() =>
                        {
                            AppendActivity($"[{id}] saved to upload queue");
                            RefreshQueueView();
                        });
                    }
                }
                catch (Exception ex)
                {
                    AppLogger.Error($"Background queue save for {id}", ex);
                    if (!IsDisposed)
                        BeginInvoke(() => AppendActivity($"[{id}] ERROR queue save: {ex.Message}"));
                }

                try
                {
                    if (queue != null)
                        await queue.TryUploadPendingAsync().ConfigureAwait(false);
                    if (!IsDisposed)
                        BeginInvoke(() => AppendActivity($"[{id}] background upload pass finished"));
                }
                catch (Exception ex)
                {
                    AppLogger.Error($"Background upload for {id}", ex);
                    if (!IsDisposed)
                        BeginInvoke(() => AppendActivity($"[{id}] ERROR upload: {ex.Message}"));
                }
            });
        }

        // ── Page list view ────────────────────────────────────────────────────

        private void PopulatePageList(IList<System.Drawing.Bitmap> bitmaps, BarcodeDetails barcode)
        {
            _lvPages.Items.Clear();
            _pageImages.Images.Clear();

            for (int i = 0; i < bitmaps.Count; i++)
            {
                var bmp   = bitmaps[i];
                var thumb = CreateThumbnail(bmp, _pageImages.ImageSize);
                _pageImages.Images.Add(thumb);

                var item = new ListViewItem($"P{i + 1}", i)
                {
                    Tag        = i,
                    ForeColor  = i == 0 ? Color.White : ColorText,
                    BackColor  = i == 0 ? ColorAccent : Color.Transparent,
                    Font       = i == 0 ? new Font("Segoe UI", 8, FontStyle.Bold) : _lvPages.Font,
                };
                _lvPages.Items.Add(item);
            }

            if (_lvPages.Items.Count > 0)
            {
                _lvPages.Items[0].Selected = true;
                _picPreview.Image = bitmaps[0];
            }

            UpdateScanWorkspaceLabels();
        }

        private void LvPages_SelectedChanged(object? sender, EventArgs e)
        {
            if (_lvPages.SelectedItems.Count == 0) return;
            var idx = _lvPages.SelectedItems[0].Tag is int tagIdx ? tagIdx : 0;
            if (idx < _currentPages.Count && File.Exists(_currentPages[idx].FilePath))
            {
                try
                {
                    var b = File.ReadAllBytes(_currentPages[idx].FilePath);
                    using var ms = new System.IO.MemoryStream(b);
                    _picPreview.Image?.Dispose();
                    _picPreview.Image = new Bitmap(ms);
                }
                catch { }
            }

            UpdateScanWorkspaceLabels();
        }

        private void MiDecodeBarcodes_Click(object? sender, EventArgs e)
        {
            if (_currentPages.Count == 0)
            {
                MessageBox.Show("No pages loaded. Scan a booklet first.", "Decode Barcodes",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            var lines = new List<string>();
            int totalFound = 0;
            for (int i = 0; i < _currentPages.Count; i++)
            {
                var sp = _currentPages[i];
                if (!File.Exists(sp.FilePath)) continue;
                try
                {
                    var bBytes = File.ReadAllBytes(sp.FilePath);
                    using var bMs = new System.IO.MemoryStream(bBytes);
                    using var bmp = new Bitmap(bMs);
                    var found = _barcode.ReadAllBarcodesDetailed(bmp);
                    if (found.Count == 0)
                        lines.Add($"Page {i + 1}: (none)");
                    else
                    {
                        foreach (var (format, text) in found)
                        {
                            lines.Add($"Page {i + 1}: {format} — {text}");
                            totalFound++;
                        }
                    }
                }
                catch (Exception ex)
                {
                    lines.Add($"Page {i + 1}: Error — {ex.Message}");
                }
            }
            var msg = lines.Count > 0
                ? string.Join("\r\n", lines)
                : "No barcodes or QR codes found.";
            MessageBox.Show($"Barcodes / QR codes found: {totalFound}\r\n\r\n{msg}",
                "Decode Barcodes", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        // ── Upload queue view ─────────────────────────────────────────────────

        private void UpdateScanWorkspaceLabels()
        {
            if (_lblScanPreviewMeta == null || _lblBatchInfo == null) return;

            int n = _currentPages.Count;
            var examCode = _cboExam?.SelectedItem is ExamInfo xe ? xe.ExamCode : "—";
            var paperCode = _cboPaper?.SelectedItem is PaperInfo pp ? pp.PaperCode : "—";
            var tplName = _selectedTemplate?.TemplateName
                ?? (_cboTemplate?.SelectedItem as ScanTemplate)?.TemplateName
                ?? "—";

            _lblBatchInfo.Text = $"Current booklet · {examCode} / {paperCode} · {tplName} · {n} page(s)";

            if (n == 0)
            {
                _lblScanPreviewMeta.Text = _isScanning ? "Waiting for first page…" : "No scan yet";
                return;
            }

            var lastPage = _currentPages[^1].PageNumber;
            var expected = _selectedTemplate?.PageCount
                ?? (_cboTemplate?.SelectedItem as ScanTemplate)?.PageCount;
            _lblScanPreviewMeta.Text = expected is > 0
                ? $"{n} / {expected} page(s) · last: P{lastPage}"
                : $"{n} page(s) · last: P{lastPage}";
        }

        /// <summary>
        /// Placeholder images so queue rows get a comfortable height. The bitmap must remain valid:
        /// ImageList takes ownership — never add a bitmap that is then disposed (e.g. via <c>using</c> on the same instance).
        /// </summary>
        private static ImageList CreateQueueRowHeightImageList()
        {
            // Width ≥ 2 avoids rare native ImageList failures; height ~ target row size.
            var il = new ImageList { ImageSize = new Size(16, 32), ColorDepth = ColorDepth.Depth32Bit };
            var bmp = new Bitmap(il.ImageSize.Width, il.ImageSize.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp))
                g.Clear(Color.FromArgb(0, 255, 255, 255));
            il.Images.Add(bmp);
            return il;
        }

        private static void DrawQueueStatusBadge(Graphics g, Rectangle bounds, string status, Font font,
            bool selected, bool activeSel)
        {
            string label = string.IsNullOrEmpty(status) ? "—" : status;
            Color fill;
            Color text;
            if (selected && activeSel)
            {
                fill = Color.FromArgb(210, 255, 255, 255);
                text = ColorPrimary;
            }
            else if (selected)
            {
                fill = Color.FromArgb(230, 236, 244);
                text = QueueRowForeColor(status);
            }
            else
            {
                fill = status switch
                {
                    "Uploaded"  => Color.FromArgb(255, 209, 250, 229),
                    "Failed"    => Color.FromArgb(255, 254, 202, 202),
                    "Pending"   => Color.FromArgb(255, 254, 240, 138),
                    "Uploading" => Color.FromArgb(255, 199, 210, 254),
                    _           => Color.FromArgb(240, 243, 246),
                };
                text = QueueRowForeColor(status);
            }

            var sz = TextRenderer.MeasureText(g, label, font, Size.Empty, TextFormatFlags.NoPadding);
            int pillH = Math.Max(18, Math.Min(bounds.Height - 4, font.Height + 6));
            int pillW = Math.Min(bounds.Width - 8, Math.Max(40, sz.Width + 16));
            int x = bounds.X;
            int y = bounds.Y + (bounds.Height - pillH) / 2;
            var pillRect = new Rectangle(x, y, pillW, pillH);
            using (var path = CreateRoundedRectPath(pillRect, 4))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using var b = new SolidBrush(fill);
                g.FillPath(b, path);
                if (selected && activeSel)
                {
                    using var pen = new Pen(Color.FromArgb(200, 255, 255, 255), 1f);
                    g.DrawPath(pen, path);
                }
            }

            var tr = new Rectangle(pillRect.X + 6, pillRect.Y, pillRect.Width - 12, pillRect.Height);
            TextRenderer.DrawText(g, label, font, tr, text,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine
                | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix);
        }

        private void LvQueue_DrawColumnHeader(object? sender, DrawListViewColumnHeaderEventArgs e)
        {
            var baseFont = e.Font ?? _lvQueue?.Font ?? SystemFonts.MessageBoxFont;
            using var font = new Font(baseFont!, FontStyle.Bold);
            using (var brush = new SolidBrush(ColorQueueHeaderBg))
                e.Graphics.FillRectangle(brush, e.Bounds);
            var textRect = Rectangle.Inflate(e.Bounds, -8, 0);
            TextRenderer.DrawText(e.Graphics, e.Header?.Text ?? "", font, textRect, ColorText,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
            using var line = new Pen(Color.FromArgb(230, 233, 239));
            e.Graphics.DrawLine(line, e.Bounds.Left, e.Bounds.Bottom - 1, e.Bounds.Right, e.Bounds.Bottom - 1);
        }

        private void LvQueue_DrawSubItem(object? sender, DrawListViewSubItemEventArgs e)
        {
            if (e.SubItem == null || e.Item == null) return;

            bool selected = (e.ItemState & ListViewItemStates.Selected) != 0;
            bool activeSel = selected && _lvQueue.Focused;

            Color bg;
            Color fg;
            if (selected)
            {
                if (activeSel)
                {
                    bg = ColorPrimary;
                    fg = Color.White;
                }
                else
                {
                    bg = Color.FromArgb(221, 226, 238);
                    fg = ColorText;
                }
            }
            else
            {
                var status = e.Item.SubItems.Count > QColStatus ? e.Item.SubItems[QColStatus].Text : "";
                bg = QueueRowBackColor(status);
                fg = QueueRowForeColor(status);
                if (e.ColumnIndex is QColPdf or QColUp)
                    fg = ColorPrimary;
            }

            using (var brush = new SolidBrush(bg))
                e.Graphics.FillRectangle(brush, e.Bounds);

            var pad = Rectangle.Inflate(e.Bounds, -6, 0);
            var rowFont = _lvQueue?.Font ?? SystemFonts.MessageBoxFont;
            if (e.ColumnIndex == QColStatus)
            {
                var st = e.Item.SubItems.Count > QColStatus ? e.Item.SubItems[QColStatus].Text : "";
                DrawQueueStatusBadge(e.Graphics, pad, st, rowFont!, selected, activeSel);
                return;
            }

            TextRenderer.DrawText(e.Graphics, e.SubItem.Text, rowFont, pad, fg,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine | TextFormatFlags.EndEllipsis);
        }

        private static Color QueueRowBackColor(string status) => status switch
        {
            "Uploaded"  => Color.FromArgb(236, 253, 245),
            "Failed"    => Color.FromArgb(254, 226, 226),
            "Pending"   => Color.FromArgb(254, 249, 195),
            "Uploading" => Color.FromArgb(224, 231, 255),
            _           => ColorCard,
        };

        private static Color QueueRowForeColor(string status) => status switch
        {
            "Uploaded"  => Color.FromArgb(4, 120, 87),
            "Failed"    => Color.FromArgb(185, 28, 28),
            "Pending"   => Color.FromArgb(146, 64, 14),
            "Uploading" => Color.FromArgb(67, 56, 202),
            _           => ColorText,
        };

        private static bool ValidateMandatoryTemplateZones(ScanTemplate template, out string error)
        {
            var tmplName = string.IsNullOrWhiteSpace(template.TemplateName) ? "(unnamed)" : template.TemplateName;
            if (string.IsNullOrWhiteSpace(template.BarcodeZonesJson))
            {
                error = $"Template '{tmplName}' is missing barcode zones. Required keys: '{BookletNameZoneKey}', '{PageSerialZoneHelper.PrimaryZoneKey}'.";
                return false;
            }

            List<TemplateBarcodeZone>? zones;
            try
            {
                zones = JsonConvert.DeserializeObject<List<TemplateBarcodeZone>>(template.BarcodeZonesJson);
            }
            catch (Exception ex)
            {
                error = $"Template '{tmplName}' has invalid BarcodeZonesJson: {ex.Message}";
                return false;
            }

            if (zones == null || zones.Count == 0)
            {
                error = $"Template '{tmplName}' has empty barcode zones. Required keys: '{BookletNameZoneKey}', '{PageSerialZoneHelper.PrimaryZoneKey}'.";
                return false;
            }

            bool hasBookletName = zones.Any(z => !string.IsNullOrWhiteSpace(z.ZoneName) &&
                z.ZoneName.Trim().Equals(BookletNameZoneKey, StringComparison.OrdinalIgnoreCase));
            bool hasPageSerial = zones.Any(z => PageSerialZoneHelper.IsReservedPageSerialName(z.ZoneName));

            if (hasBookletName && hasPageSerial)
            {
                error = "";
                return true;
            }

            var missing = new List<string>();
            if (!hasBookletName) missing.Add(BookletNameZoneKey);
            if (!hasPageSerial) missing.Add(PageSerialZoneHelper.PrimaryZoneKey);
            error = $"Template '{tmplName}' is missing mandatory zone key(s): {string.Join(", ", missing)}.";
            return false;
        }

        private void RefreshQueueView()
        {
            if (_queue == null) return;

            var items = _queue.GetFilteredRecordsByStatuses(_queueFilterDbStatuses.ToList());

            var now = DateTime.Now;
            _lvQueue.Items.Clear();
            foreach (var r in items)
            {
                var item = new ListViewItem(r.BookletId);
                item.SubItems.Add(r.ExamCode);
                item.SubItems.Add(r.PaperCode);
                item.SubItems.Add(r.RollNo);
                item.SubItems.Add($"{r.TotalPagesScanned}/{r.TotalPagesExpected}");
                item.SubItems.Add(r.Status);
                item.SubItems.Add(FormatQueueDateTime(r.ScanStartedAt));
                item.SubItems.Add(FormatQueueDateTime(r.ScanCompletedAt ?? r.CreatedAt));
                item.SubItems.Add(FormatQueueDateTime(r.UploadedAt));
                item.SubItems.Add(FormatDurationSeconds(r.ScanDurationMs));
                item.SubItems.Add(FormatDurationSeconds(r.ProcessingDurationMs));
                var nextUp = (r.Status == "Pending" || r.Status == "Failed")
                    ? FormatNextUploadHint(r, now)
                    : "—";
                item.SubItems.Add(nextUp);
                item.SubItems.Add(r.ErrorReason ?? "");
                item.SubItems.Add("↻");
                item.SubItems.Add("⬆");
                item.ImageIndex = 0;
                item.Tag       = r.BookletId;
                var sched = (r.UploadScheduleMode ?? "immediate").Trim();
                var schedDetail = sched.Equals("custom", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(r.UploadScheduleParam)
                    ? $" ({r.UploadScheduleParam} min)"
                    : "";
                item.ToolTipText = $"Folder: {r.FolderPath}{Environment.NewLine}" +
                    $"Upload schedule: {sched}{schedDetail}{Environment.NewLine}" +
                    "Click ↻ to rebuild booklet.pdf from saved pages. Click ⬆ to upload now."
                    + (string.IsNullOrWhiteSpace(r.ErrorReason) ? "" : $"{Environment.NewLine}Last error: {r.ErrorReason}");
                _lvQueue.Items.Add(item);
            }

            var allRecords    = _queue.GetAllRecords();
            int totalCount    = allRecords.Count;
            int pendingCount  = allRecords.Count(x => x.Status == "Pending" || x.Status == "Failed");
            _lblQueueHeader.Text = $"Upload Queue ({totalCount} total, {pendingCount} pending)";

            var pend = allRecords.Where(x => x.Status == "Pending" || x.Status == "Failed").ToList();
            if (pend.Count == 0)
                _lblNextUpload.Text = "";
            else
            {
                DateTime? earliest = null;
                foreach (var r in pend)
                {
                    var n = UploadScheduleHelper.GetNextEligibleUploadTime(r, now);
                    if (!earliest.HasValue || n < earliest.Value)
                        earliest = n;
                }

                _lblNextUpload.Text = earliest.HasValue && earliest.Value > now.AddSeconds(2)
                    ? $"Earliest deferred upload: {earliest.Value:yyyy-MM-dd HH\\:mm} (local)"
                    : "Next upload: eligible now or on next background poll (~30s).";
            }
        }

        private static string FormatDurationSeconds(int? ms)
        {
            if (!ms.HasValue || ms.Value < 0) return "—";
            return (ms.Value / 1000.0).ToString("0.0");
        }

        private static string FormatQueueDateTime(DateTime? dt) =>
            dt.HasValue ? dt.Value.ToString("dd-MM-yy HH:mm") : "—";

        private void LvQueue_MouseClick(object? sender, MouseEventArgs e)
        {
            if (_queue == null || e.Button != MouseButtons.Left) return;
            var hi = _lvQueue.HitTest(e.Location);
            if (hi.Item == null) return;

            int col = hi.SubItem == null ? 0 : hi.Item.SubItems.IndexOf(hi.SubItem);
            if (col != QColPdf && col != QColUp) return;

            var id = hi.Item.Tag as string;
            if (string.IsNullOrEmpty(id)) return;

            if (col == QColPdf)
                _ = RegenerateBookletPdfAsync(id);
            else
                _ = UploadQueueRowAsync(id);
        }

        private async Task RegenerateBookletPdfAsync(string bookletId)
        {
            if (_queue == null) return;
            var rec = _queue.GetRecord(bookletId);
            if (rec == null)
            {
                MessageBox.Show("Booklet not found in queue.", "PDF", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var folder = rec.FolderPath?.Trim() ?? "";
            if (string.IsNullOrEmpty(folder) || !Directory.Exists(folder))
            {
                MessageBox.Show($"Folder not found:\n{folder}", "PDF", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            List<string> pageFiles = new();
            try
            {
                var pages = JsonConvert.DeserializeObject<List<PageData>>(rec.PagesJson) ?? new List<PageData>();
                pageFiles = pages
                    .OrderBy(p => p.PageNumber)
                    .Select(p => p.ImagePath)
                    .Where(p => !string.IsNullOrWhiteSpace(p) && File.Exists(p))
                    .ToList();
            }
            catch (Exception ex)
            {
                AppLogger.Error($"Regenerate PDF: bad PagesJson for {bookletId}", ex);
            }

            if (pageFiles.Count == 0)
            {
                pageFiles = Directory.GetFiles(folder, "page_*.jpg", SearchOption.TopDirectoryOnly)
                    .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }

            if (pageFiles.Count == 0)
            {
                MessageBox.Show("No page JPEGs found for this booklet.", "PDF", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var tmpl = _selectedTemplate ?? (_cboTemplate.SelectedItem as ScanTemplate);
            if (tmpl == null)
            {
                MessageBox.Show("Select a scan template first (used for PDF quality / DPI).", "PDF",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            var effective = ScanTemplate.CloneFrom(tmpl);
            var pdfJpeg = effective.PdfJpegQuality > 0 ? effective.PdfJpegQuality : 85;
            var opts = new PdfService.CompressionOptions(JpegQuality: pdfJpeg, MaxDpi: effective.PdfMaxDpi);
            var pdfPath = Path.Combine(folder, "booklet.pdf");

            SetStatus($"Rebuilding PDF — {bookletId}…", true);
            AppendActivity($"PDF regenerate: {bookletId} ({pageFiles.Count} pages)…");
            try
            {
                await Task.Run(() => PdfService.CreateBookletPdf(pdfPath, pageFiles, opts));
                if (File.Exists(pdfPath))
                {
                    var kb = new FileInfo(pdfPath).Length / 1024;
                    AppendActivity($"PDF regenerate OK — {kb} KB");
                    AppLogger.Info($"Regenerate PDF OK: {pdfPath} ({pageFiles.Count} pages)");
                    MessageBox.Show($"Saved:\n{pdfPath}\n({kb} KB)", "PDF", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    AppendActivity("PDF regenerate failed — output file missing.");
                    MessageBox.Show("PDF was not created. See Activity log.", "PDF", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
            catch (Exception ex)
            {
                AppLogger.Error($"Regenerate PDF failed: {bookletId}", ex);
                AppendActivity($"PDF regenerate ERROR — {ex.Message}");
                MessageBox.Show(ex.Message, "PDF", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                SetStatus("Ready", false);
                RefreshQueueView();
            }
        }

        private async Task UploadQueueRowAsync(string bookletId)
        {
            if (_queue == null) return;
            if (!_api.IsAuthenticated)
            {
                MessageBox.Show("You must be logged in to upload.", "Upload", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            SetStatus($"Uploading {bookletId}…", true);
            AppendActivity($"Manual upload: {bookletId}…");
            try
            {
                var exId = (_cboExam.SelectedItem  as ExamInfo)?.ExamID  ?? 0;
                var paId = (_cboPaper.SelectedItem as PaperInfo)?.PaperID ?? 0;
                bool ok = await _queue.UploadBookletNowAsync(bookletId, exId, paId);
                RefreshQueueView();
                if (ok)
                {
                    AppendActivity($"Upload OK — {bookletId}");
                    SetStatus($"Uploaded {bookletId}", false);
                }
                else
                {
                    AppendActivity($"Upload failed — {bookletId} (see Error column / log)");
                    SetStatus($"Upload failed — {bookletId}", false, isError: true);
                }
            }
            catch (Exception ex)
            {
                AppLogger.Error($"UploadQueueRowAsync: {bookletId}", ex);
                AppendActivity($"Upload ERROR — {ex.Message}");
                SetStatus("Ready", false);
                _notifier?.Show("Upload error", ex.Message, ToolTipIcon.Error);
            }
            finally
            {
                _ = _queue.TryUploadPendingAsync();
            }
        }

        private static string FormatNextUploadHint(LocalBookletRecord r, DateTime now)
        {
            if (UploadScheduleHelper.ShouldUploadNow(r, now))
                return "now";
            var n = UploadScheduleHelper.GetNextEligibleUploadTime(r, now);
            return n <= now ? "now" : n.ToString("dd-MM HH:mm");
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        /// <summary>
        /// Skips the first two cover pages, reads page-number barcodes from every
        /// subsequent page, and returns a warning string if any page numbers are
        /// missing from the series.  Returns null when the series is complete or
        /// when there is insufficient barcode data to validate.
        /// </summary>
        private string? ValidatePageSeries(IList<System.Drawing.Bitmap> bitmaps, string? pagesFolder = null, int barcodeStartPage1Based = 3, string? barcodeZonesJson = null)
        {
            var startIdx = Math.Max(0, Math.Max(1, barcodeStartPage1Based) - 1);
            if (bitmaps.Count <= startIdx) return null;

            var found = new List<int>();

            for (int i = startIdx; i < bitmaps.Count; i++)
            {
                try
                {
                    int page1 = i + 1;
                    string? raw = null;
                    if (!string.IsNullOrEmpty(pagesFolder))
                    {
                        var diskPath = Path.Combine(pagesFolder, $"page_{page1:D3}.jpg");
                        if (File.Exists(diskPath))
                        {
                            using var saved = new Bitmap(diskPath);
                            raw = _barcode.ReadPageSerialOrFooter(saved, page1, barcodeStartPage1Based, barcodeZonesJson);
                        }
                    }

                    raw ??= _barcode.ReadPageSerialOrFooter(bitmaps[i], page1, barcodeStartPage1Based, barcodeZonesJson);
                    if (raw == null) continue;

                    // Accept either a pure integer barcode or the last numeric segment
                    // of a delimited barcode such as "EXAM_PAPER_ROLL_003"
                    string? numStr = int.TryParse(raw, out int directPg)
                        ? raw
                        : raw.Split('_').LastOrDefault(s => int.TryParse(s, out _));

                    if (numStr != null && int.TryParse(numStr, out int pg) && pg > 0)
                        found.Add(pg);
                }
                catch { /* skip unreadable barcodes */ }
            }

            if (found.Count < 2) return null; // not enough data to assess a series

            found.Sort();
            var missing = Enumerable.Range(found[0], found[^1] - found[0] + 1)
                                    .Except(found)
                                    .ToList();

            if (missing.Count == 0) return null;

            return $"Page series is incomplete.\nMissing page number(s): {string.Join(", ", missing)}\n\n" +
                   $"Detected pages: {string.Join(", ", found)}";
        }

        /// <summary>
        /// Strict barcode sequence validation using real-time collected data.
        /// Returns null when validation passes; returns error description on failure.
        /// </summary>
        private string? ValidateBarcodeSequenceStrict(int totalPages, int barcodeStartPage)
        {
            int startPage = Math.Max(1, barcodeStartPage);
            if (totalPages < startPage) return null;

            var errors = new List<string>();
            var pageNumbers = new List<int>();

            for (int p = startPage; p <= totalPages; p++)
            {
                if (!_pageBarcodesRealtime.TryGetValue(p, out var raw) || string.IsNullOrEmpty(raw))
                {
                    errors.Add($"- Missing / unreadable barcode at page {p}");
                    AppLogger.Error($"Barcode validation: page {p} — barcode NULL or unreadable");
                    continue;
                }

                string? numStr = int.TryParse(raw, out _)
                    ? raw
                    : raw.Split('_').LastOrDefault(s => int.TryParse(s, out _));

                if (numStr == null || !int.TryParse(numStr, out int pageNum) || pageNum <= 0)
                {
                    errors.Add($"- Non-numeric barcode at page {p}: \"{raw}\"");
                    AppLogger.Error($"Barcode validation: page {p} — non-numeric barcode \"{raw}\"");
                    continue;
                }

                pageNumbers.Add(pageNum);
            }

            if (errors.Count > 0)
                return string.Join("\n", errors);

            // Check for duplicates
            var duplicates = pageNumbers.GroupBy(n => n).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
            if (duplicates.Count > 0)
            {
                foreach (var d in duplicates)
                {
                    var pages = Enumerable.Range(startPage, totalPages - startPage + 1)
                        .Where(p => _pageBarcodesRealtime.TryGetValue(p, out var v) && ParseBarcodeNum(v) == d)
                        .ToList();
                    errors.Add($"- Duplicate barcode value {d} found on pages: {string.Join(", ", pages)}");
                    AppLogger.Error($"Barcode validation: duplicate value {d} on pages {string.Join(", ", pages)}");
                }
                return string.Join("\n", errors);
            }

            // Check for gaps in sequence
            pageNumbers.Sort();
            var missing = Enumerable.Range(pageNumbers[0], pageNumbers[^1] - pageNumbers[0] + 1)
                .Except(pageNumbers)
                .ToList();

            if (missing.Count > 0)
            {
                var msg = $"- Barcode sequence gap: missing value(s) {string.Join(", ", missing)}\n" +
                          $"  Detected sequence: {string.Join(", ", pageNumbers)}";
                AppLogger.Error($"Barcode validation: sequence gap — missing {string.Join(", ", missing)}");
                return msg;
            }

            return null;
        }

        private static int? ParseBarcodeNum(string? raw)
        {
            if (string.IsNullOrEmpty(raw)) return null;
            if (int.TryParse(raw, out int direct) && direct > 0) return direct;
            var last = raw.Split('_').LastOrDefault(s => int.TryParse(s, out _));
            return last != null && int.TryParse(last, out int n) && n > 0 ? n : null;
        }

        private string BuildBookletFolder(string id, ScanTemplate template) =>
            Path.Combine(_storagePath, "booklets", $"PENDING_{template.TemplateName}_{DateTime.Now:yyyyMMdd_HHmmss}");

        private static System.Drawing.Bitmap CreateThumbnail(System.Drawing.Bitmap src, Size size)
        {
            var thumb = new System.Drawing.Bitmap(size.Width, size.Height);
            using var g = Graphics.FromImage(thumb);
            g.Clear(Color.White);
            float scale = Math.Min((float)size.Width / src.Width, (float)size.Height / src.Height);
            int w = (int)(src.Width * scale), h = (int)(src.Height * scale);
            g.DrawImage(src, (size.Width - w) / 2, (size.Height - h) / 2, w, h);
            return thumb;
        }

        /// <summary>Draws a green tick or red cross badge on the bottom-right of an existing thumbnail.</summary>
        private static void StampBarcodeStatus(Bitmap thumb, bool ok)
        {
            using var g = Graphics.FromImage(thumb);
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            int badgeSize = Math.Max(16, Math.Min(thumb.Width, thumb.Height) / 4);
            int x = thumb.Width  - badgeSize - 2;
            int y = thumb.Height - badgeSize - 2;
            var rect = new Rectangle(x, y, badgeSize, badgeSize);

            if (ok)
            {
                using var brush = new SolidBrush(Color.FromArgb(210, 20, 160, 60));
                g.FillEllipse(brush, rect);
                using var pen = new Pen(Color.White, Math.Max(1.5f, badgeSize / 8f));
                g.DrawLines(pen, new[]
                {
                    new PointF(x + badgeSize * 0.22f, y + badgeSize * 0.52f),
                    new PointF(x + badgeSize * 0.42f, y + badgeSize * 0.72f),
                    new PointF(x + badgeSize * 0.78f, y + badgeSize * 0.30f),
                });
            }
            else
            {
                using var brush = new SolidBrush(Color.FromArgb(210, 210, 40, 40));
                g.FillEllipse(brush, rect);
                using var pen = new Pen(Color.White, Math.Max(1.5f, badgeSize / 8f));
                float m = badgeSize * 0.28f;
                g.DrawLine(pen, x + m, y + m, x + badgeSize - m, y + badgeSize - m);
                g.DrawLine(pen, x + badgeSize - m, y + m, x + m, y + badgeSize - m);
            }
        }

        /// <summary>
        /// Updates the thumbnail badge, list item text, and tooltip for a page after barcode decode.
        /// Must be called on the UI thread.
        /// </summary>
        private void MarkPageBarcodeStatus(int pageNum, bool ok, string? tooltipText = null)
        {
            var sp = _currentPages.FirstOrDefault(p => p.PageNumber == pageNum);
            if (sp != null)
            {
                sp.BarcodeOk   = ok;
                sp.BarcodeData = tooltipText;
            }

            int imgIdx = pageNum - 1;
            if (imgIdx >= 0 && imgIdx < _pageImages.Images.Count)
            {
                var existing = _pageImages.Images[imgIdx] as Bitmap;
                if (existing != null)
                {
                    StampBarcodeStatus(existing, ok);
                    _pageImages.Images[imgIdx] = existing;
                    _lvPages.Invalidate();
                }
            }

            if (imgIdx >= 0 && imgIdx < _lvPages.Items.Count)
            {
                var item = _lvPages.Items[imgIdx];
                item.Text = ok ? $"P{pageNum} ✓" : $"P{pageNum} ✗";
                item.ForeColor = ok ? ColorPrimary : ColorDanger;
                item.ToolTipText = ok
                    ? $"Page {pageNum} — Barcode: {tooltipText}"
                    : $"Page {pageNum} — BARCODE FAILED: {tooltipText}";
            }

            if (!ok)
            {
                bool isSelected = _lvPages.SelectedItems.Count > 0
                    && _lvPages.SelectedItems[0].Tag is int selIdx && selIdx == imgIdx;
                bool isLast = pageNum == _currentPages.Count;
                if (isSelected || isLast)
                    _picPreview.BackColor = Color.FromArgb(254, 226, 226);
            }
        }

        private void SetStatus(string text, bool busy, bool isError = false, bool isWarning = false)
        {
            _lblStatus.Text      = text;
            _progressBar.Visible = busy;
            if (busy)
                _lblStatus.ForeColor = ColorText;
            else if (isError)
                _lblStatus.ForeColor = ColorDanger;
            else if (isWarning)
                _lblStatus.ForeColor = ColorWarning;
            else
                _lblStatus.ForeColor = ColorMuted;
        }

        private void AdjustBottomPanelLayout()
        {
            bool q = _queueCard.Visible, a = _logCard.Visible;
            bool anyVisible = q || a;

            // Adjust the main table: collapse bottom row when both panels are hidden
            _mainTable.RowStyles.Clear();
            if (anyVisible)
            {
                _mainTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
                _mainTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 268));
            }
            else
            {
                _mainTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
                _mainTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 0));
            }

            // Adjust within the bottom panel
            _bottomOuter.RowStyles.Clear();
            if (q && a)
            {
                _bottomOuter.RowStyles.Add(new RowStyle(SizeType.Percent, 58f));
                _bottomOuter.RowStyles.Add(new RowStyle(SizeType.Percent, 42f));
            }
            else if (q)
            {
                _bottomOuter.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
                _bottomOuter.RowStyles.Add(new RowStyle(SizeType.Absolute, 0));
            }
            else if (a)
            {
                _bottomOuter.RowStyles.Add(new RowStyle(SizeType.Absolute, 0));
                _bottomOuter.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
            }
            else
            {
                _bottomOuter.RowStyles.Add(new RowStyle(SizeType.Absolute, 0));
                _bottomOuter.RowStyles.Add(new RowStyle(SizeType.Absolute, 0));
            }

            _bottomOuter.PerformLayout();
            _mainTable.PerformLayout();
        }

        /// <summary>Load vendor/customer QC rejections and optionally set the rescan booklet ID field.</summary>
        private async void BtnQcRejected_Click(object? sender, EventArgs e)
        {
            if (!_api.IsAuthenticated)
            {
                MessageBox.Show("Sign in first.", "QC rejected", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            try
            {
                SetStatus("Loading QC rejections…", true);
                var rows = await _api.GetRejectedBookletsAsync();
                SetStatus("Ready", false);
                using var dlg = new QcRejectedForm(rows);
                if (dlg.ShowDialog(this) == DialogResult.OK && !string.IsNullOrWhiteSpace(dlg.PickedBookletId))
                {
                    _txtQcRescanId.Text = dlg.PickedBookletId;
                    SetStatus($"QC rescan ID set — scan and upload will use: {dlg.PickedBookletId}", false);
                }
            }
            catch (Exception ex)
            {
                SetStatus("Ready", false);
                MessageBox.Show(ex.Message, "QC rejected list", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        // ── Queue retry handlers ───────────────────────────────────────────────

        /// <summary>"Retry Failed" button — resets ALL Failed records and triggers an immediate upload pass.</summary>
        private async void BtnRetryFailed_Click(object? sender, EventArgs e)
        {
            if (_queue == null) return;
            int count = _queue.ResetAllFailed();
            if (count == 0)
            {
                MessageBox.Show("No failed records to retry.", "Retry Failed",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            RefreshQueueView();
            SetStatus($"Retrying {count} failed upload(s)…", true);
            AppLogger.Info($"BtnRetryFailed_Click: {count} record(s) reset, triggering upload.");
            await _queue.TryUploadPendingAsync();
            RefreshQueueView();
            SetStatus("Ready", false);
        }

        /// <summary>Context-menu: reupload a single selected booklet.</summary>
        private async void MiRetryOne_Click(object? sender, EventArgs e)
        {
            if (_queue == null || _lvQueue.SelectedItems.Count == 0) return;
            var bookletId = _lvQueue.SelectedItems[0].Tag?.ToString();
            if (string.IsNullOrEmpty(bookletId)) return;

            _queue.ResetForRetry(bookletId);
            RefreshQueueView();
            SetStatus($"Reuploading {bookletId}…", true);
            AppLogger.Info($"MiRetryOne_Click: {bookletId} reset, triggering upload.");
            await _queue.TryUploadPendingAsync();
            RefreshQueueView();
            SetStatus("Ready", false);
        }

        /// <summary>Context-menu: copy the error reason for the selected row to the clipboard.</summary>
        private void MiCopyError_Click(object? sender, EventArgs e)
        {
            if (_lvQueue.SelectedItems.Count == 0) return;
            var errorText = _lvQueue.SelectedItems[0].SubItems[QColErr].Text;
            if (!string.IsNullOrEmpty(errorText))
            {
                Clipboard.SetText(errorText);
                SetStatus("Error reason copied to clipboard.", false);
            }
        }

        private static void PaintCardBorder(object? sender, PaintEventArgs e)
        {
            if (sender is Control c)
                ControlPaint.DrawBorder(e.Graphics, new Rectangle(0, 0, c.Width, c.Height),
                    Color.FromArgb(220, 225, 235), ButtonBorderStyle.Solid);
        }

        private static Label MakeLabel(string text, float size, FontStyle style, Color color, int x, int y)
        {
            return new Label
            {
                Text      = text,
                Font      = new Font("Segoe UI", size, style),
                ForeColor = color,
                Location  = new Point(x, y),
                AutoSize  = true,
            };
        }

        private static ComboBox MakeComboBox(int x, int y, int width) => new ComboBox
        {
            Location      = new Point(x, y),
            Width         = width,
            DropDownStyle = ComboBoxStyle.DropDownList,
        };

        private static void AddSectionLabel(Panel panel, string text, int x, int y)
        {
            panel.Controls.Add(new Label
            {
                Text      = text,
                Font      = new Font("Segoe UI", 7.5f, FontStyle.Bold),
                ForeColor = Color.FromArgb(100, 115, 130),
                Location  = new Point(x, y),
                AutoSize  = true,
            });
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            try { _connectivityTimer?.Stop(); _connectivityTimer?.Dispose(); } catch { }
            try { _scanCts?.Cancel(); _scanCts?.Dispose(); _scanCts = null; } catch { }
            try { _pauseEvent.Set(); _pauseEvent.Dispose(); } catch { }
            try { _queue?.StopBackgroundUpload(); } catch { }
            try { _queue?.Dispose(); _queue = null; } catch { }
            try { _notifier?.Dispose(); _notifier = null; } catch { }
            base.OnFormClosing(e);
        }
    }

    internal class ScannedPage
    {
        public int    PageNumber { get; set; }
        public string FilePath   { get; set; } = "";
        public string? Hash      { get; set; }
        public string? BarcodeData { get; set; }
        public string Status     { get; set; } = "Valid";
        public bool   IsPage1    { get; set; } = false;
        /// <summary>null = not yet decoded, true = barcode OK, false = missing/unreadable.</summary>
        public bool?  BarcodeOk  { get; set; }
    }
}
