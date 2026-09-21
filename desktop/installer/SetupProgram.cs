using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PrimacorEmbalagens.Installer
{
    // Native IShellLink definitions for 100% reliable Windows shortcut creation
    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink
    {
    }

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, out IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    public class SetupForm : Form
    {
        [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

        private const int SHCNE_ASSOCCHANGED = 0x08000000;
        private const int SHCNE_UPDATEDIR = 0x00001000;
        private const uint SHCNF_IDLIST = 0x0000;

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
                UpdateProgress(40, "Extraindo binários e dependências...");

                // Extract embedded payload
                ExtractPayload();

                await Task.Delay(200);
                UpdateProgress(70, "Criando atalhos e ícones oficiais...");

                CreateAllShortcuts();

                await Task.Delay(200);
                UpdateProgress(90, "Registrando aplicativo no Windows...");

                RegisterInWindows();
                CreateUninstaller();

                // Notify Windows Explorer to refresh desktop & icons
                try
                {
                    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero);
                    SHChangeNotify(SHCNE_UPDATEDIR, SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero);
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

        private List<string> GetDesktopDirectories()
        {
            var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1. Registry User Shell Folders (handles OneDrive Desktop, Portuguese Área de Trabalho, etc.)
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"))
                {
                    if (key != null)
                    {
                        var desktopValue = key.GetValue("Desktop") as string;
                        if (!string.IsNullOrEmpty(desktopValue))
                        {
                            string expanded = Environment.ExpandEnvironmentVariables(desktopValue);
                            if (Directory.Exists(expanded))
                            {
                                dirs.Add(expanded);
                            }
                        }
                    }
                }
            }
            catch {}

            // 2. Standard .NET Desktop directories
            try
            {
                string d1 = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                if (!string.IsNullOrEmpty(d1) && Directory.Exists(d1)) dirs.Add(d1);

                string d2 = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                if (!string.IsNullOrEmpty(d2) && Directory.Exists(d2)) dirs.Add(d2);
            }
            catch {}

            // 3. UserProfile OneDrive folders scan
            try
            {
                string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (Directory.Exists(userProfile))
                {
                    foreach (string subDir in Directory.GetDirectories(userProfile, "OneDrive*"))
                    {
                        string oneDesk1 = Path.Combine(subDir, "Área de Trabalho");
                        if (Directory.Exists(oneDesk1)) dirs.Add(oneDesk1);

                        string oneDesk2 = Path.Combine(subDir, "Desktop");
                        if (Directory.Exists(oneDesk2)) dirs.Add(oneDesk2);
                    }
                }
            }
            catch {}

            return new List<string>(dirs);
        }

        private List<string> GetStartMenuDirectories()
        {
            var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // Registry Programs folder
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"))
                {
                    if (key != null)
                    {
                        var progValue = key.GetValue("Programs") as string;
                        if (!string.IsNullOrEmpty(progValue))
                        {
                            string expanded = Environment.ExpandEnvironmentVariables(progValue);
                            if (Directory.Exists(expanded)) dirs.Add(expanded);
                        }
                    }
                }
            }
            catch {}

            try
            {
                string sm = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                if (!string.IsNullOrEmpty(sm) && Directory.Exists(sm)) dirs.Add(sm);

                string sm2 = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs");
                if (!string.IsNullOrEmpty(sm2) && Directory.Exists(sm2)) dirs.Add(sm2);
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

            // Create in all resolved Desktop folders (including OneDrive Área de Trabalho)
            foreach (string desktopDir in GetDesktopDirectories())
            {
                try
                {
                    string shortcutPath = Path.Combine(desktopDir, "PRIMACOR EMBALAGENS.lnk");
                    CreateNativeShortcut(shortcutPath, exePath, iconPath, installDir, "PRIMACOR EMBALAGENS - CAD & 3D");
                }
                catch {}
            }

            // Create in Start Menu
            foreach (string progDir in GetStartMenuDirectories())
            {
                try
                {
                    string shortcutPath = Path.Combine(progDir, "PRIMACOR EMBALAGENS.lnk");
                    CreateNativeShortcut(shortcutPath, exePath, iconPath, installDir, "PRIMACOR EMBALAGENS - CAD & 3D");
                }
                catch {}
            }
        }

        private void CreateNativeShortcut(string shortcutPath, string targetPath, string iconPath, string workingDir, string description)
        {
            try
            {
                IShellLinkW link = (IShellLinkW)new ShellLink();
                link.SetPath(targetPath);
                link.SetWorkingDirectory(workingDir);
                link.SetDescription(description);
                link.SetIconLocation(iconPath, 0);

                IPersistFile file = (IPersistFile)link;
                file.Save(shortcutPath, false);
            }
            catch
            {
                // Fallback to WScript Shell if native COM fails
                try
                {
                    Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                    if (shellType != null)
                    {
                        dynamic shell = Activator.CreateInstance(shellType);
                        dynamic shortcut = shell.CreateShortcut(shortcutPath);
                        shortcut.TargetPath = targetPath;
                        shortcut.WorkingDirectory = workingDir;
                        shortcut.Description = description;
                        shortcut.IconLocation = iconPath + ",0";
                        shortcut.Save();
                    }
                }
                catch {}
            }
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
