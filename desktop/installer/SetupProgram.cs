using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PrimacorEmbalagens.Installer
{
    public class SetupForm : Form
    {
        [DllImport("shell32.dll")]
        private static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid rfid, uint dwFlags, IntPtr hToken, out IntPtr ppszPath);

        [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

        private const int SHCNE_ASSOCCHANGED = 0x08000000;
        private const int SHCNE_UPDATEDIR = 0x00001000;

        private ProgressBar progressBar;
        private Label statusLabel;
        private Label titleLabel;
        private Label brandSubtitle;
        private Button actionButton;
        private CheckBox launchCheckBox;
        private string installDir;
        private bool isFinished = false;

        public SetupForm()
        {
            InitializeComponent();
            installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "PrimacorEmbalagens"
            );
            StartInstallationAsync();
        }

        private void InitializeComponent()
        {
            Text = "Instalador - PRIMACOR EMBALAGENS";
            Size = new Size(540, 360);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(11, 15, 25);
            ForeColor = Color.White;

            var banner = new Panel
            {
                Dock = DockStyle.Top,
                Height = 85,
                BackColor = Color.FromArgb(17, 24, 39)
            };

            titleLabel = new Label
            {
                Text = "PRIMACOR EMBALAGENS",
                Font = new Font("Segoe UI", 16, FontStyle.Bold),
                ForeColor = Color.FromArgb(255, 154, 0),
                Location = new Point(25, 15),
                AutoSize = true
            };

            brandSubtitle = new Label
            {
                Text = "Instalação do Aplicativo Desktop Oficial",
                Font = new Font("Segoe UI", 10, FontStyle.Regular),
                ForeColor = Color.FromArgb(156, 163, 175),
                Location = new Point(26, 45),
                AutoSize = true
            };

            banner.Controls.Add(titleLabel);
            banner.Controls.Add(brandSubtitle);

            statusLabel = new Label
            {
                Text = "Preparando a instalação...",
                Font = new Font("Segoe UI", 10, FontStyle.Regular),
                ForeColor = Color.FromArgb(229, 231, 235),
                Location = new Point(30, 120),
                Size = new Size(470, 45)
            };

            progressBar = new ProgressBar
            {
                Location = new Point(30, 175),
                Size = new Size(465, 18),
                Style = ProgressBarStyle.Continuous,
                Value = 10
            };

            launchCheckBox = new CheckBox
            {
                Text = "Abrir o PRIMACOR EMBALAGENS agora",
                Checked = true,
                Font = new Font("Segoe UI", 9.5f),
                ForeColor = Color.FromArgb(209, 213, 219),
                Location = new Point(30, 220),
                AutoSize = true,
                Visible = false
            };

            actionButton = new Button
            {
                Text = "Aguarde...",
                Font = new Font("Segoe UI", 10, FontStyle.Bold),
                ForeColor = Color.Black,
                BackColor = Color.FromArgb(255, 154, 0),
                FlatStyle = FlatStyle.Flat,
                Size = new Size(140, 36),
                Location = new Point(355, 260),
                Enabled = false,
                Cursor = Cursors.Hand
            };
            actionButton.FlatAppearance.BorderSize = 0;
            actionButton.Click += ActionButton_Click;

            Controls.Add(banner);
            Controls.Add(statusLabel);
            Controls.Add(progressBar);
            Controls.Add(launchCheckBox);
            Controls.Add(actionButton);
        }

        private async void StartInstallationAsync()
        {
            try
            {
                await Task.Delay(200);
                UpdateProgress(20, "Criando diretório de instalação...");

                if (!Directory.Exists(installDir))
                {
                    Directory.CreateDirectory(installDir);
                }

                await Task.Delay(200);
                UpdateProgress(40, "Extraindo arquivos do aplicativo...");

                // Extract embedded payload
                ExtractPayload();

                await Task.Delay(200);
                UpdateProgress(70, "Criando atalhos e ícones na Área de Trabalho...");

                CreateAllShortcuts();

                await Task.Delay(200);
                UpdateProgress(90, "Registrando aplicativo no Windows...");

                RegisterInWindows();
                CreateUninstaller();

                // Refresh Windows Icon Cache
                try
                {
                    SHChangeNotify(SHCNE_ASSOCCHANGED, 0, IntPtr.Zero, IntPtr.Zero);
                    SHChangeNotify(SHCNE_UPDATEDIR, 0, IntPtr.Zero, IntPtr.Zero);
                }
                catch {}

                await Task.Delay(300);
                UpdateProgress(100, "Instalação concluída com sucesso!");

                isFinished = true;
                launchCheckBox.Visible = true;
                actionButton.Text = "CONCLUIR";
                actionButton.Enabled = true;
            }
            catch (Exception ex)
            {
                statusLabel.ForeColor = Color.FromArgb(239, 68, 68);
                statusLabel.Text = "Erro na instalação: " + ex.Message;
                actionButton.Text = "Fechar";
                actionButton.Enabled = true;
            }
        }

        private void UpdateProgress(int percent, string message)
        {
            progressBar.Value = Math.Min(100, Math.Max(0, percent));
            statusLabel.Text = message;
        }

        private void ExtractPayload()
        {
            var assembly = Assembly.GetExecutingAssembly();
            using (var stream = assembly.GetManifestResourceStream("PrimacorPayload.zip"))
            {
                if (stream == null)
                {
                    throw new Exception("Arquivo de instalação corrompido (Payload ausente).");
                }

                string tempZip = Path.Combine(Path.GetTempPath(), "primacor_inst_" + Guid.NewGuid().ToString("N") + ".zip");
                using (var fileStream = File.Create(tempZip))
                {
                    stream.CopyTo(fileStream);
                }

                // Extract to installDir
                ZipFile.ExtractToDirectory(tempZip, installDir);

                try { File.Delete(tempZip); } catch {}
            }
        }

        private string GetKnownFolderPath(Guid folderGuid)
        {
            try
            {
                IntPtr pPath;
                int hr = SHGetKnownFolderPath(folderGuid, 0, IntPtr.Zero, out pPath);
                if (hr == 0 && pPath != IntPtr.Zero)
                {
                    string path = Marshal.PtrToStringUni(pPath);
                    Marshal.FreeCoTaskMem(pPath);
                    if (!string.IsNullOrEmpty(path) && Directory.Exists(path))
                    {
                        return path;
                    }
                }
            }
            catch {}
            return null;
        }

        private List<string> GetDesktopDirectories()
        {
            var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1. Windows Known Folder ID for Desktop (works in OneDrive, Brazilian Portuguese, etc.)
            // FOLDERID_Desktop: {B4BFCC3A-DB2C-424C-B029-7FE99A87C641}
            string knownDesk = GetKnownFolderPath(new Guid("B4BFCC3A-DB2C-424C-B029-7FE99A87C641"));
            if (!string.IsNullOrEmpty(knownDesk)) dirs.Add(knownDesk);

            // 2. Registry User Shell Folders
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"))
                {
                    if (key != null)
                    {
                        foreach (string valName in key.GetValueNames())
                        {
                            if (valName.IndexOf("Desktop", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                valName.IndexOf("{754AC886-DF64-4C2C-86F5-9B0E7634FA97}", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                var raw = key.GetValue(valName) as string;
                                if (!string.IsNullOrEmpty(raw))
                                {
                                    string expanded = Environment.ExpandEnvironmentVariables(raw);
                                    if (Directory.Exists(expanded)) dirs.Add(expanded);
                                }
                            }
                        }
                    }
                }
            }
            catch {}

            // 3. Standard .NET Desktop Directory
            try
            {
                string d = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                if (!string.IsNullOrEmpty(d) && Directory.Exists(d)) dirs.Add(d);
            }
            catch {}

            return new List<string>(dirs);
        }

        private List<string> GetStartMenuDirectories()
        {
            var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // FOLDERID_Programs: {A77F5D77-2E2B-44C3-A6A2-ABA601054A51}
            string knownProg = GetKnownFolderPath(new Guid("A77F5D77-2E2B-44C3-A6A2-ABA601054A51"));
            if (!string.IsNullOrEmpty(knownProg)) dirs.Add(knownProg);

            try
            {
                string sm = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                if (!string.IsNullOrEmpty(sm) && Directory.Exists(sm)) dirs.Add(sm);
            }
            catch {}

            return new List<string>(dirs);
        }

        private void CreateAllShortcuts()
        {
            string exePath = Path.Combine(installDir, "PRIMACOR-EMBALAGENS.exe");
            string iconPath = Path.Combine(installDir, "resources", "primacor.ico");
            if (!File.Exists(iconPath))
            {
                iconPath = exePath;
            }

            // Create on Desktop
            foreach (string desktopDir in GetDesktopDirectories())
            {
                try
                {
                    string shortcutPath = Path.Combine(desktopDir, "PRIMACOR EMBALAGENS.lnk");
                    CreateShortcutViaReflection(shortcutPath, exePath, iconPath, installDir, "PRIMACOR EMBALAGENS - CAD & 3D");
                }
                catch {}
            }

            // Create in Start Menu
            foreach (string progDir in GetStartMenuDirectories())
            {
                try
                {
                    string shortcutPath = Path.Combine(progDir, "PRIMACOR EMBALAGENS.lnk");
                    CreateShortcutViaReflection(shortcutPath, exePath, iconPath, installDir, "PRIMACOR EMBALAGENS - CAD & 3D");
                }
                catch {}
            }
        }

        private void CreateShortcutViaReflection(string shortcutPath, string targetPath, string iconPath, string workingDir, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType != null)
                {
                    object shell = Activator.CreateInstance(shellType);
                    object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
                    if (shortcut != null)
                    {
                        Type scType = shortcut.GetType();
                        scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                        scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDir });
                        scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { iconPath + ",0" });
                        scType.InvokeMember("Description", BindingFlags.SetProperty, null, shortcut, new object[] { description });
                        scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
                    }
                }
            }
            catch {}
        }

        private void RegisterInWindows()
        {
            try
            {
                string keyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\PrimacorEmbalagens";
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(keyPath))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", "PRIMACOR EMBALAGENS", RegistryValueKind.String);
                        key.SetValue("DisplayVersion", "1.0.0", RegistryValueKind.String);
                        key.SetValue("Publisher", "PRIMACOR GRAFICA E EDITORA LTDA", RegistryValueKind.String);
                        key.SetValue("DisplayIcon", Path.Combine(installDir, "resources", "primacor.ico") + ",0", RegistryValueKind.String);
                        key.SetValue("InstallLocation", installDir, RegistryValueKind.String);
                        key.SetValue("UninstallString", "\"" + Path.Combine(installDir, "uninstall.cmd") + "\"", RegistryValueKind.String);
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
            }
            catch {}
        }

        private void CreateUninstaller()
        {
            try
            {
                string uninstScript = Path.Combine(installDir, "uninstall.cmd");
                var desktopDirs = GetDesktopDirectories();
                var startDirs = GetStartMenuDirectories();

                var sb = new StringBuilder();
                sb.AppendLine("@echo off");
                sb.AppendLine("echo Removendo PRIMACOR EMBALAGENS...");
                sb.AppendLine("taskkill /f /im PRIMACOR-EMBALAGENS.exe >nul 2>&1");

                foreach (var d in desktopDirs)
                {
                    sb.AppendLine("del /f /q \"" + Path.Combine(d, "PRIMACOR EMBALAGENS.lnk") + "\" >nul 2>&1");
                }
                foreach (var s in startDirs)
                {
                    sb.AppendLine("del /f /q \"" + Path.Combine(s, "PRIMACOR EMBALAGENS.lnk") + "\" >nul 2>&1");
                }

                sb.AppendLine("reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PrimacorEmbalagens\" /f >nul 2>&1");
                sb.AppendLine("timeout /t 1 >nul");
                sb.AppendLine("rmdir /s /q \"" + installDir + "\" >nul 2>&1");
                sb.AppendLine("echo Desinstalacao concluida!");

                File.WriteAllText(uninstScript, sb.ToString());
            }
            catch {}
        }

        private void ActionButton_Click(object sender, EventArgs e)
        {
            if (isFinished)
            {
                if (launchCheckBox.Checked)
                {
                    string exePath = Path.Combine(installDir, "PRIMACOR-EMBALAGENS.exe");
                    if (File.Exists(exePath))
                    {
                        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = exePath,
                            WorkingDirectory = installDir
                        });
                    }
                }
            }
            Application.Exit();
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
