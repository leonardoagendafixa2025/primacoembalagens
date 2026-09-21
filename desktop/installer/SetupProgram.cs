using System;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PrimacorEmbalagens.Installer
{
    public class SetupForm : Form
    {
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
            BackColor = Color.FromArgb(11, 15, 25); // #0b0f19 Dark Slate
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
                Text = "Abrir o PRIMACOR EMBALAGENS ao concluir",
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
                await Task.Delay(300);
                UpdateProgress(20, "Criando diretório de instalação...");

                if (!Directory.Exists(installDir))
                {
                    Directory.CreateDirectory(installDir);
                }

                await Task.Delay(200);
                UpdateProgress(40, "Instalando binários e dependências...");

                // Extract embedded payload
                ExtractPayload();

                await Task.Delay(200);
                UpdateProgress(70, "Criando atalhos na Área de Trabalho e Menu Iniciar...");

                CreateShortcuts();

                await Task.Delay(200);
                UpdateProgress(90, "Registrando aplicativo no Windows...");

                RegisterInWindows();
                CreateUninstaller();

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

        private void CreateShortcuts()
        {
            string exePath = Path.Combine(installDir, "PRIMACOR-EMBALAGENS.exe");
            string iconPath = Path.Combine(installDir, "resources", "primacor.ico");
            if (!File.Exists(iconPath))
            {
                iconPath = exePath;
            }

            // Desktop Shortcut
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string desktopShortcut = Path.Combine(desktopDir, "PRIMACOR EMBALAGENS.lnk");
            CreateShortcutFile(desktopShortcut, exePath, iconPath, installDir, "PRIMACOR EMBALAGENS - CAD & 3D");

            // Start Menu Shortcut
            string programsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs");
            string startMenuShortcut = Path.Combine(programsDir, "PRIMACOR EMBALAGENS.lnk");
            CreateShortcutFile(startMenuShortcut, exePath, iconPath, installDir, "PRIMACOR EMBALAGENS - CAD & 3D");
        }

        private void CreateShortcutFile(string shortcutPath, string targetPath, string iconPath, string workingDir, string description)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = workingDir;
                shortcut.Description = description;
                shortcut.IconLocation = iconPath + ",0";
                shortcut.Save();
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
                        key.SetValue("DisplayIcon", Path.Combine(installDir, "resources", "primacor.ico"), RegistryValueKind.String);
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
                string desktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "PRIMACOR EMBALAGENS.lnk");
                string startMenuShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "PRIMACOR EMBALAGENS.lnk");

                string content = "@echo off\r\n" +
                                 "echo Removendo PRIMACOR EMBALAGENS...\r\n" +
                                 "taskkill /f /im PRIMACOR-EMBALAGENS.exe >nul 2>&1\r\n" +
                                 "del /f /q \"" + desktopShortcut + "\" >nul 2>&1\r\n" +
                                 "del /f /q \"" + startMenuShortcut + "\" >nul 2>&1\r\n" +
                                 "reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PrimacorEmbalagens\" /f >nul 2>&1\r\n" +
                                 "timeout /t 1 >nul\r\n" +
                                 "rmdir /s /q \"" + installDir + "\" >nul 2>&1\r\n" +
                                 "echo Desinstalacao concluida!\r\n";

                File.WriteAllText(uninstScript, content);
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
