using System.Drawing;
using System.Threading;
using ScannerApp.Services;
using ScannerApp.Utils;

namespace ScannerApp.Forms
{
    /// <summary>
    /// Professional login screen with a collapsible Settings panel.
    /// Settings are persisted to %AppData%\ScannerApp\settings.json.
    /// </summary>
    public class LoginForm : Form
    {
        // ── Services ─────────────────────────────────────────────────────────
        private readonly ApiService _api;

        // ── Main-panel controls ───────────────────────────────────────────────
        private TextBox _txtUsername  = null!;
        private TextBox _txtPassword  = null!;
        private Button  _btnLogin     = null!;
        private Button  _btnClose     = null!;
        private Label   _lblStatus    = null!;
        private Button  _btnSettings  = null!;
        private Panel   _pnlConnStatus = null!;
        private Label   _lblServerValue = null!;
        private Label   _lblScannerValue = null!;
        private Label   _lblScannerDetail = null!;

        // ── Settings panel controls ───────────────────────────────────────────
        private Panel   _settingsPanel   = null!;
        private TextBox _txtServerUrl    = null!;
        private TextBox _txtStoragePath  = null!;
        private Button  _btnBrowsePath   = null!;
        private CheckBox _chkRememberUser = null!;
        private bool    _settingsVisible  = false;

        private System.Windows.Forms.Timer? _connPollTimer;
        private System.Windows.Forms.Timer? _scannerHotplugTimer;
        private int _connectivityGeneration;
        private int _scannerUiGeneration;
        private float _loginDpiScale = 1f;

        // ── Layout constants ──────────────────────────────────────────────────
        private const int FormWidthCollapsed  = 440;
        private const int FormHeightCollapsed = 560;

        // ── Colors (match main app design system) ─────────────────────────────
        private static readonly Color C_PrimaryDark = Color.FromArgb(0x30, 0x3F, 0x9F);
        private static readonly Color C_Primary     = Color.FromArgb(0x3F, 0x51, 0xB5);
        private static readonly Color C_Surface     = Color.FromArgb(0xF5, 0xF7, 0xFA);
        private static readonly Color C_Card        = Color.White;
        private static readonly Color C_InputBg     = Color.FromArgb(0xF9, 0xFA, 0xFB);
        private static readonly Color C_Text        = Color.FromArgb(0x1F, 0x29, 0x37);
        private static readonly Color C_Muted       = Color.FromArgb(0x6B, 0x72, 0x80);
        private static readonly Color C_Success     = Color.FromArgb(0x10, 0xB9, 0x81);
        private static readonly Color C_Danger      = Color.FromArgb(0xEF, 0x44, 0x44);
        private static readonly Color C_Border      = Color.FromArgb(0xE5, 0xE7, 0xEB);
        private static readonly Color C_SettingsBg  = Color.FromArgb(0xF3, 0xF4, 0xF6);
        private static readonly Color C_SettingsBorder = C_Border;

        public LoginForm(ApiService api)
        {
            _api = api;
            BuildForm();
            LoadPersistedSettings();
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Form construction
        // ─────────────────────────────────────────────────────────────────────

        private void BuildForm()
        {
            using var g = CreateGraphics();
            float dpiScale = Math.Max(1f, g.DpiX / 96f);
            _loginDpiScale = dpiScale;

            int w = (int)(FormWidthCollapsed * dpiScale);
            int h = (int)(FormHeightCollapsed * dpiScale);

            Text            = $"Scanning Station — Login — {AppVersion.GetTitleSuffix()}";
            Size            = new Size(w, h);
            MinimumSize     = new Size(w, h);
            StartPosition   = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox     = false;
            BackColor       = C_Surface;
            Font            = new Font("Segoe UI", 10f * dpiScale, FontStyle.Regular, GraphicsUnit.Point);

            var root = new TableLayoutPanel
            {
                Dock        = DockStyle.Fill,
                ColumnCount = 1,
                RowCount    = 2,
                BackColor   = C_Surface,
            };
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, (int)(70 * dpiScale)));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));

            var header = new Panel
            {
                Dock      = DockStyle.Fill,
                BackColor = C_PrimaryDark,
                Padding   = new Padding((int)(20 * dpiScale), 14, 20, 10),
            };
            header.Paint += (_, e) =>
            {
                using var line = new Pen(C_Primary, 2);
                e.Graphics.DrawLine(line, 0, header.Height - 1, header.Width, header.Height - 1);
            };

            var hdrInner = new TableLayoutPanel
            {
                Dock        = DockStyle.Fill,
                ColumnCount = 1,
                RowCount    = 2,
                BackColor   = Color.Transparent,
            };
            hdrInner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            hdrInner.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            var lblTitle = new Label
            {
                Text      = "Scanning Station",
                Font      = new Font("Segoe UI", 14f * dpiScale, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = Color.White,
                AutoSize  = true,
            };
            var lblSub = new Label
            {
                Text      = $"Answer sheet digitisation · {AppVersion.GetTitleSuffix()}",
                Font      = new Font("Segoe UI", 9f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = Color.FromArgb(200, 210, 235),
                AutoSize  = true,
                Margin    = new Padding(0, 4, 0, 0),
            };
            hdrInner.Controls.Add(lblTitle, 0, 0);
            hdrInner.Controls.Add(lblSub, 0, 1);
            header.Controls.Add(hdrInner);

            var body = new TableLayoutPanel
            {
                Dock        = DockStyle.Fill,
                ColumnCount = 3,
                RowCount    = 6,
                BackColor   = C_Surface,
                Padding     = new Padding((int)(16 * dpiScale), (int)(16 * dpiScale), (int)(16 * dpiScale), (int)(12 * dpiScale)),
            };
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            body.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            body.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            body.RowStyles.Add(new RowStyle(SizeType.Percent, 38f));
            body.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            body.RowStyles.Add(new RowStyle(SizeType.Absolute, (int)(24 * dpiScale)));
            body.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            body.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            body.RowStyles.Add(new RowStyle(SizeType.Percent, 62f));

            int cardW = (int)(360 * dpiScale);
            int innerW = cardW - (int)(40 * dpiScale);

            var card = new Panel
            {
                Width    = cardW,
                Height   = (int)(400 * dpiScale),
                BackColor = C_Card,
                Padding  = new Padding((int)(20 * dpiScale)),
            };
            card.Paint += PaintRoundedBorder;

            var cardStack = new TableLayoutPanel
            {
                Dock        = DockStyle.Fill,
                AutoSize    = true,
                ColumnCount = 1,
            };
            cardStack.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));

            void AddCardRow(Control c, int bottomMargin = 10)
            {
                c.Margin = new Padding(0, 0, 0, bottomMargin);
                c.Dock   = DockStyle.Top;
                int idx  = cardStack.RowCount++;
                cardStack.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                cardStack.Controls.Add(c, 0, idx);
            }

            var lblWelcome = new Label
            {
                Text      = "Sign in to your account",
                Font      = new Font("Segoe UI", 11f * dpiScale, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = C_Text,
                AutoSize  = true,
            };
            AddCardRow(lblWelcome, 12);

            _pnlConnStatus = new Panel
            {
                Width     = innerW,
                AutoSize  = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                BackColor = C_InputBg,
                Padding   = new Padding((int)(12 * dpiScale), (int)(10 * dpiScale), (int)(12 * dpiScale), (int)(10 * dpiScale)),
            };
            _pnlConnStatus.Paint += (s, e) =>
            {
                using var pen = new Pen(C_Border, 1);
                e.Graphics.DrawRectangle(pen, 0, 0, _pnlConnStatus.Width - 1, _pnlConnStatus.Height - 1);
            };
            var connGrid = new TableLayoutPanel
            {
                Dock         = DockStyle.Top,
                AutoSize     = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                ColumnCount  = 2,
                RowCount     = 3,
                BackColor    = Color.Transparent,
                Width        = innerW,
            };
            connGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, (int)(72 * dpiScale)));
            connGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
            connGrid.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            connGrid.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            connGrid.RowStyles.Add(new RowStyle(SizeType.AutoSize));

            var hdrServer = new Label
            {
                Text      = "Server",
                Font      = new Font("Segoe UI", 8f * dpiScale, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = C_Muted,
                AutoSize  = true,
                Anchor    = AnchorStyles.Left | AnchorStyles.Top,
                Margin    = new Padding(0, 2, 0, 0),
            };
            _lblServerValue = new Label
            {
                Text      = "Checking…",
                Font      = new Font("Segoe UI", 9.5f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = C_Muted,
                AutoSize  = true,
                Anchor    = AnchorStyles.Left | AnchorStyles.Top,
                Margin    = new Padding(0, 0, 0, (int)(6 * dpiScale)),
            };

            var hdrScanner = new Label
            {
                Text      = "Scanner",
                Font      = new Font("Segoe UI", 8f * dpiScale, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = C_Muted,
                AutoSize  = true,
                Anchor    = AnchorStyles.Left | AnchorStyles.Top,
                Margin    = new Padding(0, 2, 0, 0),
            };
            _lblScannerValue = new Label
            {
                Text      = "Checking…",
                Font      = new Font("Segoe UI", 9.5f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = C_Muted,
                AutoSize  = true,
                Anchor    = AnchorStyles.Left | AnchorStyles.Top,
            };
            _lblScannerDetail = new Label
            {
                Text      = "",
                Font      = new Font("Segoe UI", 8.25f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = C_Muted,
                AutoSize  = true,
                Anchor    = AnchorStyles.Left | AnchorStyles.Top,
                Margin    = new Padding(0, 2, 0, 0),
            };

            connGrid.Controls.Add(hdrServer, 0, 0);
            connGrid.Controls.Add(_lblServerValue, 1, 0);
            connGrid.Controls.Add(hdrScanner, 0, 1);
            connGrid.Controls.Add(_lblScannerValue, 1, 1);
            connGrid.Controls.Add(_lblScannerDetail, 0, 2);
            connGrid.SetColumnSpan(_lblScannerDetail, 2);
            _pnlConnStatus.Controls.Add(connGrid);
            AddCardRow(_pnlConnStatus, 18);

            AddCardRow(MakeFieldLabel("Username", dpiScale), 6);
            _txtUsername = MakeLoginTextBox(false, innerW, dpiScale);
            _txtUsername.Text = "operator1";
            AddCardRow(_txtUsername, 14);

            AddCardRow(MakeFieldLabel("Password", dpiScale), 6);
            _txtPassword = MakeLoginTextBox(true, innerW, dpiScale);
            _txtPassword.Text = "password123";
            AddCardRow(_txtPassword, 12);

            _chkRememberUser = new CheckBox
            {
                Text      = "Remember username",
                AutoSize  = true,
                ForeColor = C_Muted,
                Font      = new Font("Segoe UI", 9f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
            };
            AddCardRow(_chkRememberUser, 16);

            var btnRow = new FlowLayoutPanel
            {
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents  = false,
                AutoSize      = true,
            };
            int btnW = (int)(150 * dpiScale);
            int btnH = (int)(36 * dpiScale);
            _btnLogin = new Button
            {
                Text      = "Login",
                Width     = btnW,
                Height    = btnH,
                FlatStyle = FlatStyle.Flat,
                BackColor = C_Primary,
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 10f * dpiScale, FontStyle.Bold, GraphicsUnit.Point),
                Cursor    = Cursors.Hand,
                Margin    = new Padding(0, 0, (int)(10 * dpiScale), 0),
            };
            _btnLogin.FlatAppearance.BorderSize = 0;
            _btnLogin.Click += BtnLogin_Click;

            _btnClose = new Button
            {
                Text      = "Close",
                Width     = btnW,
                Height    = btnH,
                FlatStyle = FlatStyle.Flat,
                BackColor = C_Card,
                ForeColor = C_Danger,
                Font      = new Font("Segoe UI", 10f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
                Cursor    = Cursors.Hand,
            };
            _btnClose.FlatAppearance.BorderColor = Color.FromArgb(252, 165, 165);
            _btnClose.FlatAppearance.BorderSize  = 1;
            _btnClose.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

            btnRow.Controls.Add(_btnLogin);
            btnRow.Controls.Add(_btnClose);
            AddCardRow(btnRow, (int)(20 * dpiScale));

            _lblStatus = new Label
            {
                Text      = "",
                Height    = (int)(24 * dpiScale),
                AutoSize  = false,
                Dock      = DockStyle.Top,
                Width     = innerW,
                Font      = new Font("Segoe UI", 9f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
                ForeColor = C_Danger,
            };
            AddCardRow(_lblStatus, 0);

            card.Controls.Add(cardStack);

            _btnSettings = new Button
            {
                Text      = "Settings",
                Width     = cardW,
                Height    = (int)(38 * dpiScale),
                FlatStyle = FlatStyle.Flat,
                BackColor = C_SettingsBg,
                ForeColor = C_Muted,
                Font      = new Font("Segoe UI", 9.5f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
                Cursor    = Cursors.Hand,
                TextAlign = ContentAlignment.MiddleCenter,
            };
            _btnSettings.FlatAppearance.BorderColor = C_SettingsBorder;
            _btnSettings.FlatAppearance.BorderSize  = 1;
            _btnSettings.Margin = new Padding(0, (int)(8 * dpiScale), 0, (int)(6 * dpiScale));
            _btnSettings.Click += BtnSettings_Click;

            _settingsPanel = new Panel
            {
                Width     = cardW,
                BackColor = C_SettingsBg,
                Visible   = false,
                Padding   = new Padding((int)(12 * dpiScale), (int)(10 * dpiScale), (int)(12 * dpiScale), (int)(10 * dpiScale)),
            };
            _settingsPanel.Paint += (s, e) =>
            {
                ControlPaint.DrawBorder(e.Graphics,
                    new Rectangle(0, 0, _settingsPanel.Width, _settingsPanel.Height),
                    C_SettingsBorder, ButtonBorderStyle.Solid);
            };

            int sy = (int)(8 * dpiScale);
            var lblUrl = MakeFieldLabel("API Server URL", dpiScale);
            lblUrl.Location = new Point(_settingsPanel.Padding.Left, sy);
            lblUrl.AutoSize = true;
            sy += (int)(22 * dpiScale);
            int settingsInnerW = cardW - _settingsPanel.Padding.Horizontal;
            _txtServerUrl = MakeSettingsTextBox(settingsInnerW, dpiScale);
            _txtServerUrl.Location = new Point(_settingsPanel.Padding.Left, sy);
            _txtServerUrl.Text = "http://localhost:4000";
            _txtServerUrl.Leave += async (_, _) => await CheckConnectivityAsync();
            sy += (int)(40 * dpiScale);

            var lblPath = MakeFieldLabel("Local Storage Path", dpiScale);
            lblPath.Location = new Point(_settingsPanel.Padding.Left, sy);
            lblPath.AutoSize = true;
            sy += (int)(22 * dpiScale);
            int pathFieldW = Math.Max(120, settingsInnerW - (int)(46 * dpiScale));
            _txtStoragePath = MakeSettingsTextBox(pathFieldW, dpiScale);
            _txtStoragePath.Location = new Point(_settingsPanel.Padding.Left, sy);
            _btnBrowsePath = new Button
            {
                Text      = "…",
                Location  = new Point(_settingsPanel.Padding.Left + pathFieldW + 4, sy - 1),
                Size      = new Size((int)(38 * dpiScale), (int)(32 * dpiScale)),
                FlatStyle = FlatStyle.Flat,
                BackColor = C_InputBg,
                ForeColor = C_Text,
            };
            _btnBrowsePath.FlatAppearance.BorderColor = C_Border;
            _btnBrowsePath.Click += BtnBrowsePath_Click;
            sy += (int)(44 * dpiScale);

            _settingsPanel.Height = sy + (int)(12 * dpiScale);
            _settingsPanel.Controls.AddRange(new Control[]
            {
                lblUrl, _txtServerUrl,
                lblPath, _txtStoragePath, _btnBrowsePath,
            });

            var spacerBelowCard = new Panel
            {
                Dock      = DockStyle.Fill,
                BackColor = Color.Transparent,
            };

            body.Controls.Add(card, 1, 1);
            body.Controls.Add(spacerBelowCard, 1, 2);
            body.Controls.Add(_btnSettings, 1, 3);
            body.Controls.Add(_settingsPanel, 1, 4);

            root.Controls.Add(header, 0, 0);
            root.Controls.Add(body, 0, 1);
            Controls.Add(root);

            AcceptButton = _btnLogin;

            FormClosed += (_, _) =>
            {
                if (_connPollTimer != null)
                {
                    _connPollTimer.Stop();
                    _connPollTimer.Dispose();
                    _connPollTimer = null;
                }
                if (_scannerHotplugTimer != null)
                {
                    _scannerHotplugTimer.Stop();
                    _scannerHotplugTimer.Dispose();
                    _scannerHotplugTimer = null;
                }
            };

            Load += async (_, _) =>
            {
                _connPollTimer = new System.Windows.Forms.Timer { Interval = 30_000 };
                _connPollTimer.Tick += async (_, _) => await CheckConnectivityAsync();
                _connPollTimer.Start();
                _scannerHotplugTimer = new System.Windows.Forms.Timer { Interval = 3_000 };
                _scannerHotplugTimer.Tick += async (_, _) => await RefreshScannerStatusAsync();
                _scannerHotplugTimer.Start();
                await CheckConnectivityAsync();
            };
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Settings toggle
        // ─────────────────────────────────────────────────────────────────────

        private void BtnSettings_Click(object? sender, EventArgs e)
        {
            _settingsVisible = !_settingsVisible;

            int baseH = (int)(FormHeightCollapsed * _loginDpiScale);
            if (_settingsVisible)
            {
                _settingsPanel.Visible = true;
                Height              = baseH + _settingsPanel.Height + (int)(16 * _loginDpiScale);
                _btnSettings.Text   = "Settings  ▲";
                _ = CheckConnectivityAsync();
            }
            else
            {
                _settingsPanel.Visible = false;
                Height            = baseH;
                _btnSettings.Text = "Settings";
            }
        }

        private readonly record struct ScannerUiSnapshot(bool Ok, ScannerDevice? Primary, bool NetworkSourcesOnly);

        private static ScannerUiSnapshot QueryScannerSnapshot()
        {
            try
            {
                var svc = new ScannerService();
                var all = svc.GetScannerDevices();
                var pick = svc.EnumerateScannersPreferPhysical();
                if (pick.Count == 0) return new ScannerUiSnapshot(false, null, false);
                var primary = pick[0];
                bool netOnly = all.Count > 0 && all.TrueForAll(d => ScannerService.IsNetworkStyleWiaDevice(d.DeviceId));
                return new ScannerUiSnapshot(true, primary, netOnly);
            }
            catch
            {
                return new ScannerUiSnapshot(false, null, false);
            }
        }

        private void ApplyScannerLabels(ScannerUiSnapshot snap)
        {
            var warnOrange = Color.FromArgb(0xF5, 0x9E, 0x0B);
            if (!snap.Ok || snap.Primary is null)
            {
                _lblScannerValue.Text = "Not detected";
                _lblScannerValue.ForeColor = warnOrange;
                _lblScannerDetail.Text =
                    "Plug in a USB scanner, or add a network scanner in Windows (WSD).";
            }
            else
            {
                _lblScannerValue.Text = "Ready";
                _lblScannerValue.ForeColor = C_Success;
                _lblScannerDetail.Text = snap.NetworkSourcesOnly
                    ? $"Network · {snap.Primary.Name}"
                    : $"USB / local · {snap.Primary.Name}";
            }
        }

        private async Task RefreshScannerStatusAsync()
        {
            if (IsDisposed || !IsHandleCreated) return;
            int gen = Interlocked.Increment(ref _scannerUiGeneration);
            _lblScannerValue.Text = "Checking…";
            _lblScannerValue.ForeColor = C_Muted;
            _lblScannerDetail.Text = "";
            var snap = await Task.Run(QueryScannerSnapshot).ConfigureAwait(true);
            if (gen != Volatile.Read(ref _scannerUiGeneration)) return;
            if (IsDisposed) return;
            ApplyScannerLabels(snap);
        }

        private async Task CheckConnectivityAsync()
        {
            if (IsDisposed || !IsHandleCreated) return;

            int gen = Interlocked.Increment(ref _connectivityGeneration);
            Interlocked.Increment(ref _scannerUiGeneration);

            var url = _txtServerUrl?.Text?.Trim().TrimEnd('/') ?? "";

            _lblServerValue.Text = "Checking…";
            _lblServerValue.ForeColor = C_Muted;
            _lblScannerValue.Text = "Checking…";
            _lblScannerValue.ForeColor = C_Muted;
            _lblScannerDetail.Text = "";

            if (string.IsNullOrWhiteSpace(url))
            {
                if (gen != Volatile.Read(ref _connectivityGeneration)) return;
                if (IsDisposed) return;
                _lblServerValue.Text = "Not configured";
                _lblServerValue.ForeColor = C_Muted;
            }
            else
            {
                try
                {
                    var saved = _api.BaseUrl;
                    _api.BaseUrl = url;
                    bool ok = await _api.PingAsync().ConfigureAwait(true);
                    _api.BaseUrl = saved;
                    if (gen != Volatile.Read(ref _connectivityGeneration)) return;
                    if (IsDisposed) return;
                    _lblServerValue.Text = ok ? "Online" : "Offline";
                    _lblServerValue.ForeColor = ok ? C_Success : C_Danger;
                }
                catch
                {
                    if (gen != Volatile.Read(ref _connectivityGeneration)) return;
                    if (IsDisposed) return;
                    _lblServerValue.Text = "Offline";
                    _lblServerValue.ForeColor = C_Danger;
                }
            }

            ScannerUiSnapshot snap;
            try
            {
                snap = await Task.Run(QueryScannerSnapshot).ConfigureAwait(true);
            }
            catch
            {
                snap = new ScannerUiSnapshot(false, null, false);
            }

            if (gen != Volatile.Read(ref _connectivityGeneration)) return;
            if (IsDisposed) return;

            ApplyScannerLabels(snap);
        }

        private void BtnBrowsePath_Click(object? sender, EventArgs e)
        {
            using var dlg = new FolderBrowserDialog
            {
                Description         = "Select local folder for scanned booklets",
                UseDescriptionForTitle = true,
            };
            if (!string.IsNullOrWhiteSpace(_txtStoragePath.Text) && Directory.Exists(_txtStoragePath.Text))
                dlg.InitialDirectory = _txtStoragePath.Text;

            if (dlg.ShowDialog() == DialogResult.OK)
                _txtStoragePath.Text = dlg.SelectedPath;
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Login logic
        // ─────────────────────────────────────────────────────────────────────

        private async void BtnLogin_Click(object? sender, EventArgs e)
        {
            _btnLogin.Enabled = false;
            _btnClose.Enabled = false;
            SetStatus("Signing in…", C_Muted);

            // Apply settings before login
            var url = _txtServerUrl.Text.Trim().TrimEnd('/');
            if (!string.IsNullOrWhiteSpace(url))
                _api.BaseUrl = url;

            try
            {
                await _api.LoginAsync(_txtUsername.Text.Trim(), _txtPassword.Text);

                // Persist settings
                SaveSettings();

                // Apply storage path override if set
                var storagePath = _txtStoragePath.Text.Trim();
                if (!string.IsNullOrWhiteSpace(storagePath))
                {
                    try { Directory.CreateDirectory(storagePath); }
                    catch { }
                    StoragePathDialog.SaveDefaultPath(storagePath);
                }

                SetStatus($"Welcome, {_api.CurrentUser?.FullName}", C_Success);
                await Task.Delay(400);

                DialogResult = DialogResult.OK;
                Close();
            }
            catch (Exception ex)
            {
                SetStatus(ex.Message, C_Danger);
                _btnLogin.Enabled = true;
                _btnClose.Enabled = true;
            }
        }

        private void SetStatus(string text, Color color)
        {
            _lblStatus.Text      = text;
            _lblStatus.ForeColor = color;
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Settings persistence
        // ─────────────────────────────────────────────────────────────────────

        private static readonly string SettingsDir  =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ScannerApp");
        private static readonly string SettingsFile =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ScannerApp", "settings.json");

        private void LoadPersistedSettings()
        {
            try
            {
                if (!File.Exists(SettingsFile)) return;
                var json = File.ReadAllText(SettingsFile);
                var obj  = Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, string>>(json);
                if (obj == null) return;

                if (obj.TryGetValue("apiUrl",      out var url)  && !string.IsNullOrWhiteSpace(url))
                    _txtServerUrl.Text  = url;
                if (obj.TryGetValue("storagePath", out var path) && !string.IsNullOrWhiteSpace(path))
                    _txtStoragePath.Text = path;
                if (obj.TryGetValue("username",    out var user) && !string.IsNullOrWhiteSpace(user))
                {
                    _txtUsername.Text    = user;
                    _chkRememberUser.Checked = true;
                }
            }
            catch { }
        }

        private void SaveSettings()
        {
            try
            {
                Directory.CreateDirectory(SettingsDir);
                var existing = new Dictionary<string, string>();
                if (File.Exists(SettingsFile))
                {
                    try
                    {
                        existing = Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, string>>(
                            File.ReadAllText(SettingsFile)) ?? new();
                    }
                    catch { }
                }

                existing["apiUrl"]      = _api.BaseUrl;
                existing["storagePath"] = _txtStoragePath.Text.Trim();
                if (_chkRememberUser.Checked)
                    existing["username"] = _txtUsername.Text.Trim();
                else
                    existing.Remove("username");

                File.WriteAllText(SettingsFile,
                    Newtonsoft.Json.JsonConvert.SerializeObject(existing, Newtonsoft.Json.Formatting.Indented));
            }
            catch { }
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Helpers
        // ─────────────────────────────────────────────────────────────────────

        private static Label MakeFieldLabel(string text, float dpiScale) => new Label
        {
            Text      = text,
            Font      = new Font("Segoe UI", 9f * dpiScale, FontStyle.Bold, GraphicsUnit.Point),
            ForeColor = Color.FromArgb(55, 65, 81),
            AutoSize  = true,
        };

        private static TextBox MakeLoginTextBox(bool password, int width, float dpiScale) => new TextBox
        {
            Height       = (int)(32 * dpiScale),
            Width        = width,
            Font         = new Font("Segoe UI", 10f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
            BorderStyle  = BorderStyle.FixedSingle,
            BackColor    = C_InputBg,
            ForeColor    = C_Text,
            PasswordChar = password ? '●' : '\0',
        };

        private static TextBox MakeSettingsTextBox(int width, float dpiScale) => new TextBox
        {
            Height      = (int)(32 * dpiScale),
            Width       = width,
            Font        = new Font("Segoe UI", 10f * dpiScale, FontStyle.Regular, GraphicsUnit.Point),
            BorderStyle = BorderStyle.FixedSingle,
            BackColor   = C_InputBg,
            ForeColor   = C_Text,
        };

        private static void PaintRoundedBorder(object? sender, PaintEventArgs e)
        {
            if (sender is Control c)
                ControlPaint.DrawBorder(e.Graphics,
                    new Rectangle(0, 0, c.Width, c.Height),
                    C_Border, ButtonBorderStyle.Solid);
        }
    }
}
