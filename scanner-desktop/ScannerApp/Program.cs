using ScannerApp.Forms;
using ScannerApp.Services;

namespace ScannerApp
{
    internal static class Program
    {
        [STAThread]
        static void Main()
        {
            // Catch unhandled exceptions on the UI thread
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (_, args) =>
            {
                MessageBox.Show(
                    $"An unexpected error occurred:\n\n{args.Exception.Message}\n\nDetails:\n{args.Exception}",
                    "Unexpected Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            };

            // Catch unhandled exceptions on background threads
            AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            {
                var ex = args.ExceptionObject as Exception;
                MessageBox.Show(
                    $"Fatal error:\n\n{ex?.Message ?? args.ExceptionObject?.ToString()}",
                    "Fatal Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            };

            ApplicationConfiguration.Initialize();

            var api = new ApiService();

            try
            {
                var loginForm = new LoginForm(api);
                if (loginForm.ShowDialog() != DialogResult.OK)
                    return;

                Application.Run(new MainForm(api));
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Failed to launch the main window:\n\n{ex.Message}\n\n{ex.StackTrace}",
                    "Launch Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
