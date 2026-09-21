using System;
using System.Threading;
using System.Windows.Forms;

namespace PrimacorEmbalagens.Desktop
{
    static class Program
    {
        private const string AppGuid = "c2e42b6a-9a4f-4d92-bf39-0d122e11894d";

        [STAThread]
        static void Main()
        {
            // Single Instance Mutex
            using (Mutex mutex = new Mutex(false, "Global\\" + AppGuid))
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                // High DPI support
                try
                {
                    SetProcessDPIAware();
                }
                catch {}

                Application.Run(new MainWindow());
            }
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();
    }
}
