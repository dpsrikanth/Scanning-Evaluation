using Newtonsoft.Json;

namespace ScannerApp.Forms
{
    /// <summary>
    /// Shown at app startup to let the operator choose a local output folder.
    /// The chosen path is persisted to %AppData%\ScannerApp\settings.json.
    /// </summary>
    public class StoragePathDialog : Form
    {
        private static readonly string SettingsDir  = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ScannerApp");
        private static readonly string SettingsPath = Path.Combine(SettingsDir, "settings.json");

        private Label _lblTitle    = null!;
        private Label _lblCurrent  = null!;
        private TextBox _txtPath   = null!;
        private Button _btnBrowse  = null!;
        private Button _btnOk      = null!;
        private Button _btnCancel  = null!;

        public string SelectedPath { get; private set; } = "";

        public StoragePathDialog()
        {
            Text            = "Scanner — Local Storage Setup";
            Size            = new Size(520, 220);
            StartPosition   = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox     = false;
            MinimizeBox     = false;
            BackColor       = Color.FromArgb(245, 247, 250);

            BuildUI();

            // Pre-populate from saved settings
            var saved = LoadSavedPath();
            if (!string.IsNullOrWhiteSpace(saved))
                _txtPath.Text = saved;
            else
                _txtPath.Text = Path.Combine(@"C:\ScanOutput");
        }

        private void BuildUI()
        {
            _lblTitle = new Label
            {
                Text      = "Select local folder for scanned booklets",
                Font      = new Font("Segoe UI", 11, FontStyle.Bold),
                Location  = new Point(18, 18),
                AutoSize  = true,
                ForeColor = Color.FromArgb(30, 60, 120),
            };

            _lblCurrent = new Label
            {
                Text      = "Scanned images and the upload queue will be stored here.",
                Font      = new Font("Segoe UI", 9),
                Location  = new Point(18, 46),
                AutoSize  = true,
                ForeColor = Color.FromArgb(90, 100, 115),
            };

            _txtPath = new TextBox
            {
                Location = new Point(18, 78),
                Width    = 380,
                Font     = new Font("Consolas", 9),
            };

            _btnBrowse = new Button
            {
                Text     = "Browse…",
                Location = new Point(406, 76),
                Width    = 90,
                Height   = 28,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(220, 230, 245),
                ForeColor = Color.FromArgb(30, 60, 120),
            };
            _btnBrowse.Click += BtnBrowse_Click;

            _btnOk = new Button
            {
                Text      = "Use this folder",
                Location  = new Point(260, 140),
                Width     = 130,
                Height    = 34,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(13, 110, 74),
                ForeColor = Color.White,
                Font      = new Font("Segoe UI", 9, FontStyle.Bold),
            };
            _btnOk.Click += BtnOk_Click;

            _btnCancel = new Button
            {
                Text      = "Exit App",
                Location  = new Point(400, 140),
                Width     = 96,
                Height    = 34,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(220, 50, 50),
                ForeColor = Color.White,
            };
            _btnCancel.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };

            Controls.AddRange(new Control[] { _lblTitle, _lblCurrent, _txtPath, _btnBrowse, _btnOk, _btnCancel });
        }

        private void BtnBrowse_Click(object? sender, EventArgs e)
        {
            using var dlg = new FolderBrowserDialog
            {
                Description         = "Select the root folder for scanned booklets",
                UseDescriptionForTitle = true,
            };
            if (!string.IsNullOrWhiteSpace(_txtPath.Text) && Directory.Exists(_txtPath.Text))
                dlg.InitialDirectory = _txtPath.Text;

            if (dlg.ShowDialog() == DialogResult.OK)
                _txtPath.Text = dlg.SelectedPath;
        }

        private void BtnOk_Click(object? sender, EventArgs e)
        {
            var path = _txtPath.Text.Trim();
            if (string.IsNullOrWhiteSpace(path))
            {
                MessageBox.Show("Please enter or browse to a valid folder.", "Required",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            try { Directory.CreateDirectory(path); }
            catch (Exception ex)
            {
                MessageBox.Show($"Cannot create folder: {ex.Message}", "Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            SelectedPath = path;
            SavePath(path);
            DialogResult = DialogResult.OK;
            Close();
        }

        // ── Persist helpers ──────────────────────────────────────────────────

        private static Dictionary<string, string> LoadSettings()
        {
            try
            {
                if (!File.Exists(SettingsPath)) return new();
                var json = File.ReadAllText(SettingsPath);
                return JsonConvert.DeserializeObject<Dictionary<string, string>>(json) ?? new();
            }
            catch { return new(); }
        }

        private static void SaveSettings(Dictionary<string, string> settings)
        {
            try
            {
                Directory.CreateDirectory(SettingsDir);
                File.WriteAllText(SettingsPath, JsonConvert.SerializeObject(settings, Formatting.Indented));
            }
            catch { }
        }

        private static string? LoadSavedPath()
        {
            return LoadSettings().GetValueOrDefault("storagePath");
        }

        private static void SavePath(string path)
        {
            var settings = LoadSettings();
            settings["storagePath"] = path;
            SaveSettings(settings);
        }

        /// <summary>
        /// Loads the previously saved path if it still exists, or returns null.
        /// Callers can skip showing the dialog if this returns a valid path.
        /// </summary>
        public static string? GetSavedPath()
        {
            var p = LoadSavedPath();
            return (!string.IsNullOrWhiteSpace(p) && Directory.Exists(p)) ? p : null;
        }

        /// <summary>Persists a path chosen programmatically (e.g. auto-selected default).</summary>
        public static void SaveDefaultPath(string path) => SavePath(path);

        /// <summary>Returns the previously saved default scanner name, or null.</summary>
        public static string? GetSavedScanner()
        {
            return LoadSettings().GetValueOrDefault("defaultScanner");
        }

        /// <summary>Persists the selected scanner name as the default for this operator.</summary>
        public static void SaveDefaultScanner(string scannerName)
        {
            var settings = LoadSettings();
            settings["defaultScanner"] = scannerName;
            SaveSettings(settings);
        }
    }
}
