using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
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
        private IScannerService          _scanner;
        private LocalQueueService?       _queue;

        // ── State ─────────────────────────────────────────────────────────────
        private ScanSettings?            _settings;
        private WorkstationInfo?         _myWorkstation;
        private ScanTemplate?            _selectedTemplate;
        private string                   _storagePath = "";
        private readonly List<ScannedPage> _currentPages = new();
        private CancellationTokenSource? _scanCts;

        // ── Left panel controls ───────────────────────────────────────────────
        private Label      _lblOperator     = null!;
        private Label      _lblWorkstation  = null!;
        private Label      _lblDriverMode   = null!;
        private ComboBox   _cboExam         = null!;
        private ComboBox   _cboPaper        = null!;
        private ComboBox   _cboTemplate     = null!;
        private ComboBox   _cboScanner           = null!;
        private Button     _btnSetDefaultScanner = null!;
        private Button     _btnViewLog           = null!;
        private CheckBox   _chkDeskewTrim   = null!;
        private CheckBox   _chkTwainUi      = null!;
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

        // ── Bottom panel controls ─────────────────────────────────────────────
        private ListView   _lvQueue         = null!;
        private Label      _lblQueueHeader  = null!;
        private ComboBox   _cboQueueFilter  = null!;
        private Button     _btnQcRejected   = null!;
        private Button     _btnRetryFailed  = null!;
        private TextBox    _txtActivityLog  = null!;
        private Label      _lblNextUpload   = null!;
        private const int ActivityLogMaxLines = 500;

        /// <summary>Pages finished processing (deskew/save), flushed to UI in 1..N order.</summary>
        private readonly ConcurrentDictionary<int, (string FilePath, string Hash)> _pagesReadyForUi = new();
        private int _nextSequentialUiPage = 1;
        private readonly object _sequentialUiLock = new();

        // ── Header bar ────────────────────────────────────────────────────────
        private Panel      _headerPanel     = null!;
        private Label      _lblAppTitle     = null!;
        private Button     _btnLogout       = null!;
        private Button     _btnChangePath   = null!;

        // ── Colors ────────────────────────────────────────────────────────────
        private static readonly Color ColorPrimary    = Color.FromArgb(13, 110, 74);
        private static readonly Color ColorSurface    = Color.FromArgb(245, 247, 250);
        private static readonly Color ColorCard       = Color.White;
        private static readonly Color ColorBorder     = Color.FromArgb(220, 225, 235);
        private static readonly Color ColorText       = Color.FromArgb(20, 30, 50);
        private static readonly Color ColorMuted      = Color.FromArgb(100, 115, 130);
        private static readonly Color ColorAccent     = Color.FromArgb(30, 80, 200);
        private static readonly Color ColorDanger     = Color.FromArgb(200, 50, 50);

        public MainForm(ApiService api)
        {
            _api     = api;
            _barcode = new BarcodeService();
            _scanner = new ScannerService();   // default WIA; may swap to TWAIN after workstation load
            InitializeComponent();
            Load += MainForm_Load;
        }

        // ── UI Construction ───────────────────────────────────────────────────

        private void InitializeComponent()
        {
            Text            = "Scanner — Scanning Station";
            Size            = new Size(1280, 820);
            MinimumSize     = new Size(1024, 700);
            StartPosition   = FormStartPosition.CenterScreen;
            BackColor       = ColorSurface;
            Font            = new Font("Segoe UI", 9);
            FormBorderStyle = FormBorderStyle.Sizable;

            BuildHeader();
            BuildMainLayout();
        }

        private void BuildHeader()
        {
            _headerPanel = new Panel
            {
                Dock      = DockStyle.Top,
                Height    = 52,
                BackColor = Color.FromArgb(20, 40, 80),
                Padding   = new Padding(12, 0, 12, 0),
            };

            _lblAppTitle = new Label
            {
                Text      = "📄  Scanning Station",
                Font      = new Font("Segoe UI", 12, FontStyle.Bold),
                ForeColor = Color.White,
                Dock      = DockStyle.Left,
                TextAlign = ContentAlignment.MiddleLeft,
                AutoSize  = false,
                Width     = 280,
            };

            _lblOperator = new Label
            {
                Text      = "",
                Font      = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(190, 210, 240),
                Dock      = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter,
                AutoSize  = false,
            };

            _btnLogout = new Button
            {
                Text      = "Logout",
                Width     = 80,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(180, 50, 50),
                ForeColor = Color.White,
                Cursor    = Cursors.Hand,
                Dock      = DockStyle.Right,
            };
            _btnLogout.FlatAppearance.BorderSize = 0;
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

            _btnChangePath = new Button
            {
                Text      = "📁 Storage",
                Width     = 100,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(40, 60, 100),
                ForeColor = Color.White,
                Cursor    = Cursors.Hand,
                Dock      = DockStyle.Right,
            };
            _btnChangePath.FlatAppearance.BorderSize = 0;
            _btnChangePath.Click += BtnChangePath_Click;

            _btnViewLog = new Button
            {
                Text      = "📋 Log",
                Width     = 80,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(40, 60, 100),
                ForeColor = Color.White,
                Cursor    = Cursors.Hand,
                Dock      = DockStyle.Right,
            };
            _btnViewLog.FlatAppearance.BorderSize = 0;
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

            _btnQcRejected = new Button
            {
                Text      = "QC rejected…",
                Width     = 118,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(40, 60, 100),
                ForeColor = Color.White,
                Cursor    = Cursors.Hand,
                Dock      = DockStyle.Right,
                Font      = new Font("Segoe UI", 8.5f),
            };
            _btnQcRejected.FlatAppearance.BorderSize = 0;
            _btnQcRejected.Click += BtnQcRejected_Click;

            _headerPanel.Controls.AddRange(new Control[]
                { _lblAppTitle, _lblOperator, _btnQcRejected, _btnViewLog, _btnChangePath, _btnLogout });
            Controls.Add(_headerPanel);
        }

        private void BuildMainLayout()
        {
            var mainTable = new TableLayoutPanel
            {
                Dock        = DockStyle.Fill,
                ColumnCount = 2,
                RowCount    = 2,
                Padding     = new Padding(8),
                BackColor   = ColorSurface,
            };
            mainTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 260));
            mainTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            mainTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            mainTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 268));

            mainTable.Controls.Add(BuildLeftPanel(), 0, 0);
            mainTable.Controls.Add(BuildCenterPanel(), 1, 0);
            mainTable.Controls.Add(BuildBottomPanel(), 0, 1);
            mainTable.SetColumnSpan(mainTable.GetControlFromPosition(0, 1)!, 2);

            Controls.Add(mainTable);
        }

        private Panel BuildLeftPanel()
        {
            var panel = new Panel
            {
                Dock      = DockStyle.Fill,
                BackColor = ColorCard,
                Padding   = new Padding(14, 14, 14, 14),
                AutoScroll = true,
            };
            panel.Paint += PaintCardBorder;

            int y = 14;

            // Workstation info
            _lblWorkstation = MakeLabel("— Workstation loading… —", 9, FontStyle.Bold, ColorPrimary, 14, y); y += 22;
            _lblDriverMode  = MakeLabel("Driver: WIA", 8, FontStyle.Regular, ColorMuted, 14, y); y += 30;

            AddSectionLabel(panel, "EXAM", 14, y); y += 22;
            _cboExam = MakeComboBox(14, y, 228); y += 34;
            _cboExam.SelectedIndexChanged += CboExam_Changed;

            AddSectionLabel(panel, "PAPER", 14, y); y += 22;
            _cboPaper = MakeComboBox(14, y, 228); y += 34;
            _cboPaper.SelectedIndexChanged += (_, _) => SyncQueueUploadFallback();

            AddSectionLabel(panel, "SCAN TEMPLATE", 14, y); y += 22;
            _cboTemplate = MakeComboBox(14, y, 228); y += 34;
            _cboTemplate.SelectedIndexChanged += CboTemplate_Changed;

            _txtTemplateDetail = new TextBox
            {
                Location      = new Point(14, y),
                Width         = 228,
                Height        = 168,
                Font          = new Font("Segoe UI", 7.5f),
                ForeColor     = ColorText,
                BackColor     = Color.FromArgb(252, 252, 254),
                BorderStyle   = BorderStyle.FixedSingle,
                Multiline     = true,
                ReadOnly      = true,
                ScrollBars    = ScrollBars.Vertical,
                WordWrap      = false,
                TabStop       = false,
                Cursor        = Cursors.Default,
                Text          = "Select a template above",
            };
            y += 172;

            AddSectionLabel(panel, "SCANNER", 14, y); y += 22;

            var scannerRow = new Panel { Location = new Point(14, y), Width = 228, Height = 28 };
            _cboScanner = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width         = 148,
                Dock          = DockStyle.Left,
            };
            _btnRefresh = new Button
            {
                Text      = "⟳",
                Width     = 36,
                Height    = 26,
                FlatStyle = FlatStyle.Flat,
                Dock      = DockStyle.Right,
                BackColor = ColorSurface,
            };
            _btnRefresh.FlatAppearance.BorderColor = ColorBorder;
            _btnRefresh.Click += (_, _) => LoadScanners();
            _btnSetDefaultScanner = new Button
            {
                Text      = "★",
                Width     = 36,
                Height    = 26,
                FlatStyle = FlatStyle.Flat,
                Dock      = DockStyle.Right,
                BackColor = ColorSurface,
                Font      = new Font("Segoe UI", 9),
            };
            _btnSetDefaultScanner.FlatAppearance.BorderColor = ColorBorder;
            _btnSetDefaultScanner.Click += (_, _) =>
            {
                if (_cboScanner.SelectedItem is string name)
                {
                    StoragePathDialog.SaveDefaultScanner(name);
                    SetStatus($"Default scanner set: {name}", false);
                }
            };
            ToolTip tt = new ToolTip();
            tt.SetToolTip(_btnSetDefaultScanner, "Set as default scanner");
            scannerRow.Controls.AddRange(new Control[] { _cboScanner, _btnSetDefaultScanner, _btnRefresh });
            y += 38;

            _chkDeskewTrim = new CheckBox
            {
                Text      = "Deskew & trim borders (software)",
                Location  = new Point(14, y),
                Width     = 228,
                AutoSize  = true,
                Checked   = true,
                ForeColor = ColorText,
            };
            _chkDeskewTrim.CheckedChanged += (_, _) => RefreshTemplateDetailView();
            var ttDeskew = new ToolTip();
            ttDeskew.SetToolTip(_chkDeskewTrim,
                "When on: grayscale → binarize → Hough line deskew (Emgu CV) with AForge fallback, " +
                "then largest-contour crop and edge trim before saving JPEGs. When off: save scans as captured. " +
                "The booklet PDF uses these saved JPEGs.");
            y += 28;

            _chkTwainUi = new CheckBox
            {
                Text      = "Show TWAIN scanner UI (driver)",
                Location  = new Point(14, y),
                Width     = 228,
                AutoSize  = true,
                Visible   = false,
                ForeColor = ColorText,
            };
            _chkTwainUi.CheckedChanged += (_, _) => SyncTwainScannerUiFlag();
            var ttTw = new ToolTip();
            ttTw.SetToolTip(_chkTwainUi, "Opens the scanner vendor’s dialog for one scan (cover open, colour, etc.). TWAIN only.");
            y += 28;

            _lblQcRescan = new Label
            {
                Text     = "Server BookletID (QC rescan)",
                Location = new Point(14, y),
                Width    = 228,
                Height   = 28,
                Font     = new Font("Segoe UI", 8f),
                ForeColor = ColorMuted,
            };
            y += 30;
            _txtQcRescanId = new TextBox
            {
                Location = new Point(14, y),
                Width    = 228,
                Font     = new Font("Segoe UI", 9f),
            };
            var ttRescan = new ToolTip();
            ttRescan.SetToolTip(_txtQcRescanId,
                "Optional. Enter the BookletID already stored on the server for a booklet that QC rejected. " +
                "The next scan uses this ID as the folder name and upload key so the server replaces the same booklet (upsert). " +
                "Use “QC rejected…” to pick one from the list.");
            y += 30;

            // Scan button
            _btnScan = new Button
            {
                Text      = "SCAN BOOKLET",
                Location  = new Point(14, y),
                Width     = 228,
                Height    = 50,
                FlatStyle = FlatStyle.Flat,
                BackColor = ColorPrimary,
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 11, FontStyle.Bold),
                Cursor    = Cursors.Hand,
            };
            _btnScan.FlatAppearance.BorderSize = 0;
            _btnScan.Click += BtnScan_Click;
            y += 60;

            _progressBar = new ProgressBar
            {
                Location = new Point(14, y),
                Width    = 228,
                Height   = 8,
                Style    = ProgressBarStyle.Marquee,
                Visible  = false,
            };
            y += 16;

            _lblStatus = new Label
            {
                Location  = new Point(14, y),
                Width     = 228,
                Height    = 30,
                Font      = new Font("Segoe UI", 8),
                ForeColor = ColorMuted,
                Text      = "Ready",
                AutoSize  = false,
            };

            panel.Controls.AddRange(new Control[]
            {
                _lblWorkstation, _lblDriverMode,
                _cboExam, _cboPaper, _cboTemplate, _txtTemplateDetail,
                scannerRow, _chkDeskewTrim, _chkTwainUi, _lblQcRescan, _txtQcRescanId, _btnScan, _progressBar, _lblStatus,
            });

            // Add all section labels manually
            return panel;
        }

        private Panel BuildCenterPanel()
        {
            var panel = new Panel { Dock = DockStyle.Fill, BackColor = ColorCard, Padding = new Padding(8) };
            panel.Paint += PaintCardBorder;

            var splitContainer = new SplitContainer
            {
                Dock          = DockStyle.Fill,
                Orientation   = Orientation.Vertical,
                Panel1MinSize = 60,
                Panel2MinSize = 120,
                FixedPanel    = FixedPanel.None,
                BackColor     = ColorCard,
            };
            // SplitterDistance must be set AFTER min-size properties and only once parent
            // has a real size; defer to Layout event to avoid InvalidOperationException.
            splitContainer.Layout += (_, _) =>
            {
                try
                {
                    if (splitContainer.Width > 200 && splitContainer.SplitterDistance < 120)
                        splitContainer.SplitterDistance = 200;
                }
                catch { }
            };

            // Left of split: page thumbnails (list view)
            _pageImages = new ImageList { ImageSize = new Size(80, 106), ColorDepth = ColorDepth.Depth32Bit };
            _lvPages = new ListView
            {
                Dock          = DockStyle.Fill,
                View          = View.LargeIcon,
                LargeImageList = _pageImages,
                BackColor     = ColorCard,
                BorderStyle   = BorderStyle.None,
                MultiSelect   = false,
            };
            _lvPages.SelectedIndexChanged += LvPages_SelectedChanged;
            var ctxPages = new ContextMenuStrip();
            var miDecode = new ToolStripMenuItem("Decode all barcodes on pages");
            miDecode.Click += MiDecodeBarcodes_Click;
            ctxPages.Items.Add(miDecode);
            _lvPages.ContextMenuStrip = ctxPages;
            splitContainer.Panel1.Controls.Add(_lvPages);

            // Right of split: large preview
            _picPreview = new PictureBox
            {
                Dock     = DockStyle.Fill,
                SizeMode = PictureBoxSizeMode.Zoom,
                BackColor = Color.FromArgb(230, 235, 242),
            };
            splitContainer.Panel2.Controls.Add(_picPreview);

            panel.Controls.Add(splitContainer);
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

            var queueCard = new Panel { Dock = DockStyle.Fill, BackColor = ColorCard };
            queueCard.Paint += PaintCardBorder;

            // Header row: queue label + status filter dropdown
            var headerRow = new Panel
            {
                Dock   = DockStyle.Top,
                Height = 26,
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

            _cboQueueFilter = new ComboBox
            {
                DropDownStyle = ComboBoxStyle.DropDownList,
                Width         = 110,
                Dock          = DockStyle.Right,
                Font          = new Font("Segoe UI", 8.5f),
            };
            _cboQueueFilter.Items.AddRange(new object[] { "Pending", "Uploaded", "Failed", "All" });
            _cboQueueFilter.SelectedIndex = 0; // default: Pending
            _cboQueueFilter.SelectedIndexChanged += (_, _) => RefreshQueueView();

            _btnRetryFailed = new Button
            {
                Text      = "⟳ Retry Failed",
                Width     = 105,
                Dock      = DockStyle.Right,
                FlatStyle = FlatStyle.Flat,
                Font      = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(180, 60, 20),
                BackColor = ColorCard,
                Cursor    = Cursors.Hand,
            };
            _btnRetryFailed.FlatAppearance.BorderColor = Color.FromArgb(180, 60, 20);
            _btnRetryFailed.Click += BtnRetryFailed_Click;

            headerRow.Controls.Add(_cboQueueFilter);
            headerRow.Controls.Add(_btnRetryFailed);
            headerRow.Controls.Add(_lblQueueHeader);

            _lvQueue = new ListView
            {
                Dock               = DockStyle.Fill,
                View               = View.Details,
                FullRowSelect      = true,
                GridLines          = true,
                BackColor          = ColorCard,
                BorderStyle        = BorderStyle.None,
                Font               = new Font("Segoe UI", 8.5f),
                ShowItemToolTips   = true,
            };
            _lvQueue.Columns.AddRange(new[]
            {
                new ColumnHeader { Text = "Booklet ID",    Width = 170 },
                new ColumnHeader { Text = "Exam",          Width = 60  },
                new ColumnHeader { Text = "Paper",         Width = 60  },
                new ColumnHeader { Text = "Roll No",       Width = 80  },
                new ColumnHeader { Text = "Pages",         Width = 50  },
                new ColumnHeader { Text = "Status",        Width = 72  },
                new ColumnHeader { Text = "Scan s",        Width = 52  },
                new ColumnHeader { Text = "Proc s",        Width = 52  },
                new ColumnHeader { Text = "Next upload",   Width = 125 },
                new ColumnHeader { Text = "Scanned At",    Width = 118 },
                new ColumnHeader { Text = "Error Reason",  Width = 160 },
            });

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
                    ? _lvQueue.SelectedItems[0].SubItems[5].Text
                    : "";
                miRetryOne.Enabled  = hasSelection && (selStatus == "Failed" || selStatus == "Pending" || selStatus == "Uploaded");
                miCopyError.Enabled = hasSelection && !string.IsNullOrEmpty(_lvQueue.SelectedItems[0].SubItems[10].Text);
            };
            _lvQueue.ContextMenuStrip = ctxQueue;

            queueCard.Controls.Add(_lvQueue);
            queueCard.Controls.Add(_lblNextUpload);
            queueCard.Controls.Add(headerRow);

            var logCard = new Panel { Dock = DockStyle.Fill, BackColor = ColorCard, Padding = new Padding(4) };
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
                Font        = new Font("Consolas", 8f),
                BackColor   = Color.FromArgb(250, 251, 253),
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
            AppLogger.Info("=== Scanner Station starting ===");
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
                    SetStatus($"Settings unavailable: {ex.Message}", false);
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
                catch { SetStatus("Could not enumerate scanners", false); }

                // 6. Local queue (always initialize — works offline)
                _queue = new LocalQueueService(_storagePath, _api);
                _queue.StatusChanged += (id, status, err) =>
                    BeginInvoke(() =>
                    {
                        AppendActivity($"Queue: {id} → {status}" + (string.IsNullOrEmpty(err) ? "" : $" — {err}"));
                        RefreshQueueView();
                    });
                SyncQueueUploadFallback();
                _queue.StartBackgroundUpload();
                RefreshQueueView();

                SetStatus("Ready", false);
            }
            catch (Exception ex)
            {
                SetStatus($"Startup error: {ex.Message}", false);
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

        private void ApplyWorkstation()
        {
            if (_myWorkstation == null)
            {
                _lblWorkstation.Text = "No workstation assigned";
                _lblWorkstation.ForeColor = ColorDanger;
                return;
            }

            _lblWorkstation.Text      = $"{_myWorkstation.WorkstationCode} — {_myWorkstation.WorkstationName}";
            _lblWorkstation.ForeColor = ColorPrimary;

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
            var scanners = _scanner.GetAvailableScanners();
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
            }
            else
            {
                SetStatus("No scanners detected. Connect a scanner and click ⟳", false);
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
                _queue.StatusChanged += (id, status, err) =>
                    BeginInvoke(() =>
                    {
                        AppendActivity($"Queue: {id} → {status}" + (string.IsNullOrEmpty(err) ? "" : $" — {err}"));
                        RefreshQueueView();
                    });
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

        private void RegisterProcessedPageForUi(int pageNum, string finalPath, string pageHash)
        {
            _pagesReadyForUi[pageNum] = (finalPath, pageHash);
            lock (_sequentialUiLock)
            {
                while (_pagesReadyForUi.TryRemove(_nextSequentialUiPage, out var info))
                {
                    int n = _nextSequentialUiPage++;
                    BeginInvoke(new Action(() => AddScannedPageToUi(n, info.FilePath, info.Hash)));
                }
            }
        }

        private void AddScannedPageToUi(int pageNum, string imagePath, string pageHash)
        {
            if (string.IsNullOrWhiteSpace(imagePath) || !File.Exists(imagePath))
                return;

            var sp = new ScannedPage
            {
                PageNumber = pageNum,
                FilePath   = imagePath,
                Hash       = pageHash,
                IsPage1    = pageNum == 1,
            };
            _currentPages.Add(sp);

            Bitmap? uiBmp = null;
            Bitmap? previewClone = null;
            try
            {
                uiBmp = new Bitmap(imagePath);
                var thumb = CreateThumbnail(uiBmp, _pageImages.ImageSize);
                _pageImages.Images.Add(thumb);
                var item = new ListViewItem($"P{pageNum}", pageNum - 1)
                {
                    Tag       = pageNum - 1,
                    ForeColor = pageNum == 1 ? Color.White : ColorText,
                    BackColor = pageNum == 1 ? ColorAccent : Color.Transparent,
                    Font      = pageNum == 1 ? new Font("Segoe UI", 8, FontStyle.Bold) : _lvPages.Font,
                };
                _lvPages.Items.Add(item);

                previewClone = (Bitmap)uiBmp.Clone();
            }
            finally
            {
                uiBmp?.Dispose();
            }

            try { _picPreview.Image?.Dispose(); } catch { /* ignore */ }
            _picPreview.Image = previewClone;
            SetStatus($"Page {pageNum} ready ({_currentPages.Count} total)", true);
        }

        /// <summary>Background pipeline: raw JPEG, optional deskew/trim, decode, ordered UI flush.</summary>
        private void RunPagePipeline(
            Bitmap sourceBmp,
            int pageNum,
            string folder,
            ScanTemplate tmpl,
            bool deskewTrim,
            SemaphoreSlim sem)
        {
            sem.Wait();
            try
            {
                string rawPath = Path.Combine(folder, $"page_{pageNum:D3}_raw.jpg");
                string finalPath = Path.Combine(folder, $"page_{pageNum:D3}.jpg");
                try
                {
                    ImageHelper.SaveAsJpeg(sourceBmp, rawPath, tmpl.JpegQuality);
                    BeginInvoke(() => AppendActivity($"P{pageNum}: raw JPEG saved"));
                }
                catch (Exception ex)
                {
                    BeginInvoke(() => AppendActivity($"P{pageNum}: raw save failed — {ex.Message}"));
                    RegisterProcessedPageForUi(pageNum, string.Empty, string.Empty);
                    return;
                }

                try
                {
                    if (deskewTrim)
                    {
                        using var processed = ImageHelper.AutoTrimAndDeskew(sourceBmp, true);
                        WriteFinalJpegAtomic(processed, finalPath, tmpl.JpegQuality);
                    }
                    else
                    {
                        WriteFinalJpegAtomic(sourceBmp, finalPath, tmpl.JpegQuality);
                    }
                }
                catch (Exception ex)
                {
                    BeginInvoke(() => AppendActivity($"P{pageNum}: deskew/save failed — {ex.Message}; using raw copy."));
                    try { WriteFinalJpegAtomic(sourceBmp, finalPath, tmpl.JpegQuality); }
                    catch (Exception ex2)
                    {
                        BeginInvoke(() => AppendActivity($"P{pageNum}: fallback save failed — {ex2.Message}"));
                        RegisterProcessedPageForUi(pageNum, string.Empty, string.Empty);
                        return;
                    }
                }

                // Flush thumbs/preview as soon as the final JPEG exists (before slow barcode decode).
                string hash = "";
                if (File.Exists(finalPath))
                {
                    try
                    {
                        hash = HashHelper.ComputeSha256(finalPath);
                    }
                    catch
                    {
                        // ignore
                    }
                }

                RegisterProcessedPageForUi(pageNum, finalPath, hash);
                BeginInvoke(() => AppendActivity($"P{pageNum}: final JPEG ready"));

                if (File.Exists(finalPath))
                {
                    try
                    {
                        using var decBmp = new Bitmap(finalPath);
                        var (lin, qr) = _barcode.ReadLinearAndQrParallel(decBmp);
                        string footer = "";
                        if (pageNum >= tmpl.BarcodeStartPage)
                            footer = _barcode.ReadPageSerialOrFooter(decBmp, pageNum, tmpl.BarcodeStartPage, tmpl.BarcodeZonesJson) ?? "";
                        string msg = pageNum >= tmpl.BarcodeStartPage
                            ? $"P{pageNum}: decode linear={lin ?? "—"} QR={qr ?? "—"} footer#={(string.IsNullOrEmpty(footer) ? "—" : footer)}"
                            : $"P{pageNum}: decode linear={lin ?? "—"} QR={qr ?? "—"}";
                        BeginInvoke(() => AppendActivity(msg));
                    }
                    catch
                    {
                        // decode is best-effort
                    }
                }
            }
            finally
            {
                try
                {
                    sourceBmp.Dispose();
                }
                catch
                {
                    // ignore
                }

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
            _btnScan.Enabled     = false;
            _progressBar.Visible = true;
            SetStatus($"Scanning — {effectiveTemplate.TemplateName}…", true);
            _currentPages.Clear();
            _lvPages.Items.Clear();
            _pageImages.Images.Clear();
            _picPreview.Image = null;
            _pagesReadyForUi.Clear();
            _nextSequentialUiPage = 1;

            _scanCts = new CancellationTokenSource();

            var pendingFolder = BuildBookletFolder("PENDING", effectiveTemplate);
            Directory.CreateDirectory(pendingFolder);

            // Allow some overlap while bounding memory (full-page 300 dpi bitmaps per worker).
            int parallel = Math.Max(2, Math.Min(12, Environment.ProcessorCount * 2));
            var pipelineSem = new SemaphoreSlim(parallel);
            var pageTasks = new List<Task>();
            bool deskewTrim = _chkDeskewTrim.Checked;
            int pageCounter = 0;

            AppendActivity($"Scan started — {effectiveTemplate.TemplateName} ({effectiveTemplate.PageCount} pp expected)");

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
                    AppendActivity($"P{pageNum}: could not clone bitmap — {ex.Message}");
                    RegisterProcessedPageForUi(pageNum, string.Empty, string.Empty);
                    return;
                }

                var c = clone!;
                int n = pageNum;
                pageTasks.Add(Task.Run(() => RunPagePipeline(c, n, pendingFolder, effectiveTemplate, deskewTrim, pipelineSem)));
                AppendActivity($"P{pageNum}: scan received, queued for processing");
                SetStatus($"Scanning — page {pageNum} captured…", true);
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
                            Directory.Delete(pendingFolder, true);
                    }
                    catch
                    {
                        // ignore
                    }

                    SetStatus("No pages scanned — feeder may be empty", false);
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
                            RegisterProcessedPageForUi(page1, string.Empty, string.Empty);
                            continue;
                        }

                        int n = page1;
                        var bb = b;
                        pageTasks.Add(Task.Run(() => RunPagePipeline(bb, n, pendingFolder, effectiveTemplate, deskewTrim, pipelineSem!)));
                    }
                }

                var processSw = Stopwatch.StartNew();
                await Task.WhenAll(pageTasks);
                AppendActivity($"Pipeline: all {bitmaps.Count} pages processed on disk");

                SetStatus($"Scan complete — validating and building booklet…", true);

                var seriesWarning = ValidatePageSeries(bitmaps, pendingFolder, effectiveTemplate.BarcodeStartPage, effectiveTemplate.BarcodeZonesJson);
                if (seriesWarning != null)
                    MessageBox.Show(seriesWarning, "Page Series Warning",
                        MessageBoxButtons.OK, MessageBoxIcon.Warning);

                var pagesForZones = new List<Bitmap>();
                Dictionary<string, string> zoneMap;
                try
                {
                    for (int i = 1; i <= bitmaps.Count; i++)
                    {
                        var pth = Path.Combine(pendingFolder, $"page_{i:D3}.jpg");
                        if (File.Exists(pth))
                            pagesForZones.Add(new Bitmap(pth));
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
                Directory.CreateDirectory(Path.GetDirectoryName(finalFolder)!);
                if (Directory.Exists(pendingFolder) && pendingFolder != finalFolder)
                {
                    Directory.Move(pendingFolder, finalFolder);
                    foreach (var sp in _currentPages)
                        sp.FilePath = sp.FilePath.Replace(pendingFolder, finalFolder);
                }

                TryDeleteRawJpegs(finalFolder, bitmaps.Count);

                var pageFiles = _currentPages.OrderBy(p => p.PageNumber).Select(p => p.FilePath).ToList();
                var pdfPath = Path.Combine(finalFolder, "booklet.pdf");
                var pdfJpeg = effectiveTemplate.PdfJpegQuality > 0 ? effectiveTemplate.PdfJpegQuality : 85;
                var pdfMaxDpi = effectiveTemplate.PdfMaxDpi;
                var pdfOptions = new PdfService.CompressionOptions(JpegQuality: pdfJpeg, MaxDpi: pdfMaxDpi);
                try
                {
                    await Task.Run(() => PdfService.CreateBookletPdf(pdfPath, pageFiles, pdfOptions));
                }
                catch
                {
                    /* PDF generation failure is non-fatal */
                }

                processSw.Stop();
                AppendActivity($"Booklet saved: {bookletId} — scan {scanSw.Elapsed.TotalSeconds:0.0}s, post-process {processSw.Elapsed.TotalSeconds:0.0}s");

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

                _queue?.SaveToQueue(record);
                RefreshQueueView();

                _ = _queue?.TryUploadPendingAsync();

                if (!string.IsNullOrEmpty(qcOverride))
                    _txtQcRescanId.Clear();

                SetStatus($"Saved: {bookletId} ({bitmaps.Count} pages)", false);

                bool showPopup = _settings?.Defaults?.ShowBookletDetailsPopup == true;
                if (showPopup)
                {
                    using var dlg = new ScanCompleteDialog(barcodeDetails, bitmaps, effectiveTemplate.PageCount);
                    var result = dlg.ShowDialog(this);

                    if (result == DialogResult.Retry)
                    {
                        _queue?.DeleteRecord(bookletId);
                        try
                        {
                            if (Directory.Exists(finalFolder))
                                Directory.Delete(finalFolder, true);
                        }
                        catch
                        {
                            // ignore
                        }

                        _currentPages.Clear();
                        _lvPages.Items.Clear();
                        _pageImages.Images.Clear();
                        _picPreview.Image = null;
                        RefreshQueueView();
                        SetStatus("Ready for re-scan", false);
                    }
                }
            }
            catch (OperationCanceledException)
                {
                    if (scanSw.IsRunning)
                        scanSw.Stop();
                    AppLogger.Warn("Scan cancelled by user.");
                    AppendActivity("Scan cancelled by user");
                    try
                    {
                        await Task.WhenAll(pageTasks);
                    }
                    catch
                    {
                        // pipeline may fail if folder is torn down mid-write
                    }

                    try
                    {
                        if (Directory.Exists(pendingFolder))
                            Directory.Delete(pendingFolder, true);
                    }
                    catch
                    {
                        // ignore
                    }

                    SetStatus("Scan cancelled", false);
                }
                catch (Exception ex)
                {
                    try
                    {
                        await Task.WhenAll(pageTasks);
                    }
                    catch
                    {
                        // pipeline tasks may fail after scan error; do not dispose sem until drained
                    }

                    AppLogger.Error($"Scan exception: {ex.Message}", ex);
                    SetStatus($"Scan error: {ex.Message}", false);
                    MessageBox.Show($"Scanning failed:\n{ex.Message}", "Error",
                        MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            finally
            {
                pipelineSem?.Dispose();
                _btnScan.Enabled     = true;
                _progressBar.Visible = false;
                _scanCts?.Dispose();
                _scanCts = null;
            }
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
        }

        private void LvPages_SelectedChanged(object? sender, EventArgs e)
        {
            if (_lvPages.SelectedItems.Count == 0) return;
            var idx = _lvPages.SelectedItems[0].Tag is int tagIdx ? tagIdx : 0;
            if (idx < _currentPages.Count && File.Exists(_currentPages[idx].FilePath))
            {
                try { _picPreview.Image = System.Drawing.Image.FromFile(_currentPages[idx].FilePath); }
                catch { }
            }
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
                    using var bmp = new Bitmap(sp.FilePath);
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

        private void RefreshQueueView()
        {
            if (_queue == null) return;

            var filterText = _cboQueueFilter?.SelectedItem?.ToString() ?? "Pending";
            var items = filterText == "All"
                ? _queue.GetAllRecords()
                : _queue.GetFilteredRecords(filterText);

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
                item.SubItems.Add(FormatDurationSeconds(r.ScanDurationMs));
                item.SubItems.Add(FormatDurationSeconds(r.ProcessingDurationMs));
                var nextUp = (r.Status == "Pending" || r.Status == "Failed")
                    ? FormatNextUploadHint(r, now)
                    : "—";
                item.SubItems.Add(nextUp);
                item.SubItems.Add(r.CreatedAt.ToString("dd-MM-yy HH:mm:ss"));
                item.SubItems.Add(r.ErrorReason ?? "");
                item.ForeColor = StatusColor(r.Status);
                item.Tag       = r.BookletId;
                var sched = (r.UploadScheduleMode ?? "immediate").Trim();
                var schedDetail = sched.Equals("custom", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(r.UploadScheduleParam)
                    ? $" ({r.UploadScheduleParam} min)"
                    : "";
                item.ToolTipText = $"Upload schedule: {sched}{schedDetail}"
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

        private void SetStatus(string text, bool busy)
        {
            _lblStatus.Text      = text;
            _progressBar.Visible = busy;
        }

        private static Color StatusColor(string status) => status switch
        {
            "Uploaded"   => Color.FromArgb(13, 110, 74),
            "Uploading"  => Color.FromArgb(30, 100, 200),
            "Failed"     => Color.FromArgb(200, 50, 50),
            _            => Color.FromArgb(100, 115, 130),
        };

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
            var errorText = _lvQueue.SelectedItems[0].SubItems[10].Text;
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
            try { _scanCts?.Cancel(); _scanCts?.Dispose(); _scanCts = null; } catch { }
            try { _queue?.StopBackgroundUpload(); } catch { }
            try { _queue?.Dispose(); _queue = null; } catch { }
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
    }
}