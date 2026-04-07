using ScannerApp.Services;

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
        private Label   _lblServerConn  = null!;
        private Label   _lblScannerConn = null!;

        // ── Settings panel controls ───────────────────────────────────────────
        private Panel   _settingsPanel   = null!;
        private TextBox _txtServerUrl    = null!;
        private TextBox _txtStoragePath  = null!;
        private Button  _btnBrowsePath   = null!;
        private Button  _btnCheckConn    = null!;
        private CheckBox _chkRememberUser = null!;
        private bool    _settingsVisible  = false;

        // ── Layout constants ──────────────────────────────────────────────────
        private const int FormWidthCollapsed  = 420;
        private const int FormHeightCollapsed = 460;
        private const int SettingsPanelHeight = 230;

        // ── Colors ────────────────────────────────────────────────────────────
        private static readonly Color C_BrandBg     = Color.FromArgb(15, 40, 80);
        private static readonly Color C_CardBg      = Color.FromArgb(250, 251, 253);
        private static readonly Color C_Primary     = Color.FromArgb(13, 110, 74);
        private static readonly Color C_PrimaryHov  = Color.FromArgb(10, 90, 60);
        private static readonly Color C_Danger      = Color.FromArgb(190, 40, 40);
        private static readonly Color C_Border      = Color.FromArgb(200, 210, 225);
        private static readonly Color C_Muted       = Color.FromArgb(110, 120, 140);
        private static readonly Color C_SettingsBg  = Color.FromArgb(240, 244, 250);
        private static readonly Color C_SettingsBorder = Color.FromArgb(180, 195, 220);

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
            // DPI-aware sizing: scale the fixed 420×460 base by the system DPI factor
            float dpiScale;
            using (var g = CreateGraphics())
                dpiScale = g.DpiX / 96f;
            dpiScale = Math.Max(1f, dpiScale); // never shrink below 100 %

            int w = (int)(FormWidthCollapsed  * dpiScale);
            int h = (int)(FormHeightCollapsed * dpiScale);

            Text            = "Scanning Station — Login";
            Size            = new Size(w, h);
            MinimumSize     = new Size(w, h);
            StartPosition   = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox     = false;
            BackColor       = C_CardBg;
            Font            = new Font("Segoe UI", 9.5f * dpiScale);

            // ── Brand strip ───────────────────────────────────────────────────
            var brandPanel = new Panel
            {
                Dock      = DockStyle.Top,
                Height    = 90,
                BackColor = C_BrandBg,
            };
            brandPanel.Paint += (_, e) =>
            {
                // Green accent bar on the right
                e.Graphics.FillRectangle(
                    new SolidBrush(C_Primary),
                    brandPanel.Width - 6, 0, 6, brandPanel.Height);

                // Icon background circle
                using var brush = new SolidBrush(C_Primary);
                e.Graphics.FillEllipse(brush, 18, 18, 52, 52);

                // Icon lines (document symbol)
                using var penW = new Pen(Color.White, 2.5f);
                e.Graphics.DrawLine(penW, 30, 32, 58, 32);
                e.Graphics.DrawLine(penW, 30, 40, 58, 40);
                e.Graphics.DrawLine(penW, 30, 48, 50, 48);
                using var penB = new Pen(Color.FromArgb(100, 200, 255), 2f);
                e.Graphics.DrawRectangle(penB, 24, 22, 40, 46);
            };

            var lblTitle = new Label
            {
                Text      = "Scanning Station",
                Font      = new Font("Segoe UI", 15, FontStyle.Bold),
                ForeColor = Color.White,
                Location  = new Point(82, 16),
                Size      = new Size(310, 30),
                AutoSize  = false,
            };
            var lblSub = new Label
            {
                Text      = "Answer Sheet Digitisation System",
                Font      = new Font("Segoe UI", 8.5f),
                ForeColor = Color.FromArgb(160, 190, 230),
                Location  = new Point(83, 50),
                Size      = new Size(310, 20),
                AutoSize  = false,
            };
            var lblVersion = new Label
            {
                Text      = "v1.0",
                Font      = new Font("Segoe UI", 7.5f),
                ForeColor = Color.FromArgb(100, 140, 190),
                Location  = new Point(83, 68),
                AutoSize  = true,
            };
            brandPanel.Controls.AddRange(new Control[] { lblTitle, lblSub, lblVersion });
            Controls.Add(brandPanel);

            // ── Card area ─────────────────────────────────────────────────────
            var card = new Panel
            {
                Location  = new Point(30, 108),
                Size      = new Size(360, 260),
                BackColor = Color.White,
            };
            card.Paint += PaintRoundedBorder;

            var lblWelcome = new Label
            {
                Text      = "Sign in to your account",
                Font      = new Font("Segoe UI", 11, FontStyle.Bold),
                ForeColor = Color.FromArgb(20, 30, 60),
                Location  = new Point(20, 18),
                AutoSize  = true,
            };

            // Username
            var lblUser = MakeFieldLabel("Username", 20, 54);
            _txtUsername = MakeTextBox(20, 74, 320, false);
            _txtUsername.Text = "operator1";

            // Password
            var lblPass = MakeFieldLabel("Password", 20, 112);
            _txtPassword = MakeTextBox(20, 132, 320, true);
            //_txtPassword.PasswordChar = '*';
            _txtPassword.Text = "password123";
            // Remember username
            _chkRememberUser = new CheckBox
            {
                Text      = "Remember username",
                Location  = new Point(20, 170),
                AutoSize  = true,
                ForeColor = C_Muted,
                Font      = new Font("Segoe UI", 8.5f),
            };

            // Buttons row
            _btnLogin = MakeButton("Login", C_Primary, 20, 198, 150);
            _btnLogin.Click += BtnLogin_Click;

            _btnClose = MakeButton("Close", C_Danger, 190, 198, 150);
            _btnClose.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

            // Status label
            _lblStatus = new Label
            {
                Text      = "",
                Location  = new Point(20, 234),
                Width     = 320,
                Height    = 22,
                Font      = new Font("Segoe UI", 8.5f),
                ForeColor = C_Danger,
                AutoSize  = false,
            };

            card.Controls.AddRange(new Control[]
            {
                lblWelcome,
                lblUser,    _txtUsername,
                lblPass,    _txtPassword,
                _chkRememberUser,
                _btnLogin,  _btnClose,
                _lblStatus,
            });
            Controls.Add(card);

            // ── Settings toggle button ────────────────────────────────────────
            _btnSettings = new Button
            {
                Text      = "⚙  Settings",
                Location  = new Point(30, 378),
                Size      = new Size(360, 36),
                FlatStyle = FlatStyle.Flat,
                BackColor = C_SettingsBg,
                ForeColor = C_Muted,
                Font      = new Font("Segoe UI", 9),
                Cursor    = Cursors.Hand,
                TextAlign = ContentAlignment.MiddleLeft,
                Padding   = new Padding(10, 0, 0, 0),
            };
            _btnSettings.FlatAppearance.BorderColor = C_SettingsBorder;
            _btnSettings.FlatAppearance.BorderSize  = 1;
            _btnSettings.Click += BtnSettings_Click;
            Controls.Add(_btnSettings);

            // ── Settings panel (hidden by default) ────────────────────────────
            _settingsPanel = new Panel
            {
                Location  = new Point(30, 420),
                Size      = new Size(360, SettingsPanelHeight),
                BackColor = C_SettingsBg,
                Visible   = false,
                Padding   = new Padding(12, 10, 12, 10),
            };
            _settingsPanel.Paint += (s, e) =>
            {
                ControlPaint.DrawBorder(e.Graphics,
                    new Rectangle(0, 0, _settingsPanel.Width, _settingsPanel.Height),
                    C_SettingsBorder, ButtonBorderStyle.Solid);
            };

            int sy = 12;

            // API Server URL
            var lblUrl = MakeFieldLabel("API Server URL", 12, sy);
            sy += 20;
            _txtServerUrl = MakeTextBox(12, sy, 336, false);
            _txtPassword.Text = "http://localhost:4000";
            sy += 36;

            // Local storage path
            var lblPath = MakeFieldLabel("Local Storage Path", 12, sy);
            sy += 20;
            _txtStoragePath = MakeTextBox(12, sy, 292, false);
            _btnBrowsePath  = new Button
            {
                Text      = "…",
                Location  = new Point(310, sy - 1),
                Size      = new Size(38, 28),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(220, 228, 242),
                ForeColor = Color.FromArgb(30, 60, 120),
            };
            _btnBrowsePath.FlatAppearance.BorderColor = C_Border;
            _btnBrowsePath.Click += BtnBrowsePath_Click;

            // Connectivity status row inside settings panel
            sy += 36;
            _btnCheckConn = new Button
            {
                Text      = "⟳ Check Connectivity",
                Location  = new Point(12, sy),
                Size      = new Size(148, 26),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(220, 228, 242),
                ForeColor = Color.FromArgb(30, 60, 120),
                Font      = new Font("Segoe UI", 8f),
                Cursor    = Cursors.Hand,
            };
            _btnCheckConn.FlatAppearance.BorderColor = C_Border;
            _btnCheckConn.Click += async (_, _) => await CheckConnectivityAsync();

            _lblServerConn = new Label
            {
                Text      = "● Server: —",
                Location  = new Point(168, sy + 4),
                Size      = new Size(180, 18),
                Font      = new Font("Segoe UI", 8f),
                ForeColor = C_Muted,
                AutoSize  = false,
            };

            sy += 32;
            _lblScannerConn = new Label
            {
                Text      = "● Scanner: —",
                Location  = new Point(12, sy),
                Size      = new Size(230, 18),
                Font      = new Font("Segoe UI", 8f),
                ForeColor = C_Muted,
                AutoSize  = false,
            };

            _settingsPanel.Controls.AddRange(new Control[]
            {
                lblUrl, _txtServerUrl,
                lblPath, _txtStoragePath, _btnBrowsePath,
                _btnCheckConn, _lblServerConn, _lblScannerConn,
            });

            // Expand settings panel height for the new rows
            _settingsPanel.Height = sy + 30;

            Controls.Add(_settingsPanel);

            AcceptButton = _btnLogin;

            Load += async (_, _) => await CheckConnectivityAsync();
        }

        // ─────────────────────────────────────────────────────────────────────
        //  Settings toggle
        // ─────────────────────────────────────────────────────────────────────

        private void BtnSettings_Click(object? sender, EventArgs e)
        {
            _settingsVisible = !_settingsVisible;

            if (_settingsVisible)
            {
                Height = FormHeightCollapsed + _settingsPanel.Height + 10;
                _settingsPanel.Visible = true;
                _btnSettings.Text      = "⚙  Settings  ▲";
                _ = CheckConnectivityAsync();
            }
            else
            {
                _settingsPanel.Visible = false;
                Height = FormHeightCollapsed;
                _btnSettings.Text      = "⚙  Settings";
            }
        }

        private async Task CheckConnectivityAsync()
        {
            // Server connectivity
            var url = _txtServerUrl?.Text?.Trim().TrimEnd('/') ?? "";
            if (!string.IsNullOrWhiteSpace(url))
            {
                _lblServerConn.Text      = "● Server: checking…";
                _lblServerConn.ForeColor = C_Muted;
                try
                {
                    var saved = _api.BaseUrl;
                    _api.BaseUrl = url;
                    bool ok = await _api.PingAsync();
                    _api.BaseUrl = saved;
                    _lblServerConn.Text      = ok ? "● Server: Online" : "● Server: Offline";
                    _lblServerConn.ForeColor = ok ? C_Primary : C_Danger;
                }
                catch
                {
                    _lblServerConn.Text      = "● Server: Offline";
                    _lblServerConn.ForeColor = C_Danger;
                }
            }
            else
            {
                _lblServerConn.Text      = "● Server: (no URL configured)";
                _lblServerConn.ForeColor = C_Muted;
            }

            // Scanner connectivity — enumerate WIA devices
            try
            {
                var svc = new ScannerApp.Services.ScannerService();
                bool ok = svc.IsConnected();
                var scanners = svc.GetAvailableScanners();
                string nameHint = scanners.Count > 0 ? $" — {scanners[0]}" : "";
                _lblScannerConn.Text      = ok ? $"● Scanner: Ready{nameHint}" : "● Scanner: Not detected";
                _lblScannerConn.ForeColor = ok ? C_Primary : Color.FromArgb(190, 130, 20);
            }
            catch
            {
                _lblScannerConn.Text      = "● Scanner: Not detected";
                _lblScannerConn.ForeColor = Color.FromArgb(190, 130, 20);
            }
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

                SetStatus($"Welcome, {_api.CurrentUser?.FullName}", C_Primary);
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

        private static Label MakeFieldLabel(string text, int x, int y) => new Label
        {
            Text      = text,
            Font      = new Font("Segoe UI", 8, FontStyle.Bold),
            ForeColor = Color.FromArgb(70, 85, 110),
            Location  = new Point(x, y),
            AutoSize  = true,
        };

        private static TextBox MakeTextBox(int x, int y, int w, bool password) => new TextBox
        {
            Location     = new Point(x, y),
            Size         = new Size(w, 28),
            Font         = new Font("Segoe UI", 10),
            PasswordChar = password ? '●' : '\0',
            BorderStyle  = BorderStyle.FixedSingle,
            BackColor    = Color.White,
        };

        private static Button MakeButton(string text, Color bg, int x, int y, int w) => new Button
        {
            Text      = text,
            Location  = new Point(x, y),
            Size      = new Size(w, 36),
            FlatStyle = FlatStyle.Flat,
            BackColor = bg,
            ForeColor = Color.White,
            Font      = new Font("Segoe UI", 10, FontStyle.Bold),
            Cursor    = Cursors.Hand,
        };

        private static void PaintRoundedBorder(object? sender, PaintEventArgs e)
        {
            if (sender is Control c)
                ControlPaint.DrawBorder(e.Graphics,
                    new Rectangle(0, 0, c.Width, c.Height),
                    Color.FromArgb(210, 220, 235), ButtonBorderStyle.Solid);
        }
    }
}
