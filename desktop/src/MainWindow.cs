using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PrimacorEmbalagens.Desktop
{
    public class MainWindow : Form
    {
        private WebView2 webView;
        private Panel splashPanel;
        private Label splashTitle;
        private Label splashSubtitle;
        private ProgressBar splashProgress;
        private Panel errorPanel;
        private Label errorTitle;
        private Label errorSubtitle;
        private Button btnRetry;
        private bool isSystemReady = false;

        public MainWindow()
        {
            InitializeWindow();
            CreateSplashUI();
            CreateErrorUI();
            InitializeWebViewAsync();
        }

        private void InitializeWindow()
        {
            Text = Config.AppTitle;
            Name = "PrimacorMainWindow";
            Size = new Size(1366, 850);
            MinimumSize = new Size(1024, 700);
            StartPosition = FormStartPosition.CenterScreen;
            WindowState = FormWindowState.Maximized;
            BackColor = Color.FromArgb(11, 15, 25); // #0b0f19 Dark CAD Slate

            // Set Application Icon
            try
            {
                string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "resources", "primacor.ico");
                if (File.Exists(iconPath))
                {
                    Icon = new Icon(iconPath);
                }
            }
            catch {}
        }

        private void CreateSplashUI()
        {
            splashPanel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(11, 15, 25),
                Visible = true
            };

            var centerContainer = new Panel
            {
                Size = new Size(400, 260),
                BackColor = Color.Transparent
            };
            centerContainer.Location = new Point(
                (ClientSize.Width - centerContainer.Width) / 2,
                (ClientSize.Height - centerContainer.Height) / 2
            );
            centerContainer.Anchor = AnchorStyles.None;

            splashTitle = new Label
            {
                Text = "PRIMACOR",
                Font = new Font("Segoe UI", 26, FontStyle.Bold),
                ForeColor = Color.FromArgb(255, 154, 0), // #ff9a00 Primacor Gold/Orange
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 48
            };

            splashSubtitle = new Label
            {
                Text = "EMBALAGENS",
                Font = new Font("Segoe UI", 16, FontStyle.Bold),
                ForeColor = Color.White,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 32
            };

            var loadingLabel = new Label
            {
                Text = "Inicializando estúdio paramétrico CAD 2D/3D...",
                Font = new Font("Segoe UI", 10, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 40
            };

            splashProgress = new ProgressBar
            {
                Style = ProgressBarStyle.Marquee,
                MarqueeAnimationSpeed = 30,
                Dock = DockStyle.Bottom,
                Height = 6,
                ForeColor = Color.FromArgb(255, 154, 0)
            };

            centerContainer.Controls.Add(splashProgress);
            centerContainer.Controls.Add(loadingLabel);
            centerContainer.Controls.Add(splashSubtitle);
            centerContainer.Controls.Add(splashTitle);

            splashPanel.Controls.Add(centerContainer);
            Controls.Add(splashPanel);
            splashPanel.BringToFront();
        }

        private void CreateErrorUI()
        {
            errorPanel = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = Color.FromArgb(15, 23, 42),
                Visible = false
            };

            var centerContainer = new Panel
            {
                Size = new Size(480, 280),
                BackColor = Color.Transparent
            };
            centerContainer.Location = new Point(
                (ClientSize.Width - centerContainer.Width) / 2,
                (ClientSize.Height - centerContainer.Height) / 2
            );
            centerContainer.Anchor = AnchorStyles.None;

            errorTitle = new Label
            {
                Text = "Sem Conexão com a Nuvem",
                Font = new Font("Segoe UI", 18, FontStyle.Bold),
                ForeColor = Color.FromArgb(239, 68, 68),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 40
            };

            errorSubtitle = new Label
            {
                Text = "Não foi possível conectar aos servidores da PRIMACOR EMBALAGENS.\nVerifique sua conexão com a internet e tente novamente.",
                Font = new Font("Segoe UI", 10, FontStyle.Regular),
                ForeColor = Color.FromArgb(203, 213, 225),
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Height = 65
            };

            btnRetry = new Button
            {
                Text = "TENTAR NOVAMENTE",
                Font = new Font("Segoe UI", 11, FontStyle.Bold),
                ForeColor = Color.Black,
                BackColor = Color.FromArgb(255, 154, 0),
                FlatStyle = FlatStyle.Flat,
                Height = 42,
                Width = 240,
                Cursor = Cursors.Hand
            };
            btnRetry.FlatAppearance.BorderSize = 0;
            btnRetry.Location = new Point((centerContainer.Width - btnRetry.Width) / 2, 130);
            btnRetry.Click += (s, e) => RetryConnection();

            centerContainer.Controls.Add(btnRetry);
            centerContainer.Controls.Add(errorSubtitle);
            centerContainer.Controls.Add(errorTitle);

            errorPanel.Controls.Add(centerContainer);
            Controls.Add(errorPanel);
        }

        private async void InitializeWebViewAsync()
        {
            try
            {
                webView = new WebView2
                {
                    Dock = DockStyle.Fill,
                    Visible = false,
                    DefaultBackgroundColor = Color.FromArgb(11, 15, 25)
                };
                Controls.Add(webView);

                // Configure dedicated UserDataFolder in LocalAppData
                string userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "PrimacorEmbalagens",
                    "WebView2Data"
                );
                Directory.CreateDirectory(userDataFolder);

                var environment = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await webView.EnsureCoreWebView2Async(environment);

                ConfigureWebViewSettings();
                InjectDesktopBridge();

                webView.NavigationStarting += WebView_NavigationStarting;
                webView.NavigationCompleted += WebView_NavigationCompleted;
                webView.CoreWebView2.DownloadStarting += CoreWebView2_DownloadStarting;

                // Load Official Production System
                webView.CoreWebView2.Navigate(Config.ProductionUrl);
            }
            catch (Exception ex)
            {
                ShowErrorState("Falha ao inicializar o componente WebView2: " + ex.Message);
            }
        }

        private void ConfigureWebViewSettings()
        {
            if (webView == null || webView.CoreWebView2 == null) return;

            var settings = webView.CoreWebView2.Settings;
            settings.IsStatusBarEnabled = false;
            settings.AreDefaultContextMenusEnabled = true;
            settings.AreDevToolsEnabled = false; // Disabled in production
            settings.IsBuiltInErrorPageEnabled = false;
            settings.AreHostObjectsAllowed = true;
            settings.IsScriptEnabled = true;
            settings.IsWebMessageEnabled = true;
            settings.AreDefaultScriptDialogsEnabled = true;
        }

        private void InjectDesktopBridge()
        {
            if (webView == null || webView.CoreWebView2 == null) return;

            // Injects window.PrimacorDesktop into every page / frame
            string bridgeScript = @"
                (function() {
                    window.PrimacorDesktop = {
                        platform: 'windows',
                        app: 'primacor-embalagens',
                        desktop: true,
                        version: '" + Config.Version + @"',
                        company: '" + Config.CompanyName + @"',
                        bridgeUrl: '" + Config.LocalBridgeUrl + @"'
                    };
                    console.log('[PrimacorDesktop] Windows Shell Bridge Ativo v" + Config.Version + @"');
                })();
            ";

            webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(bridgeScript);
        }

        private void WebView_NavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            string uri = e.Uri.ToLowerInvariant();

            // Allow official system, local bridge, and data/blob URIs
            if (uri.StartsWith("https://primacorembalagens.vercel.app") ||
                uri.StartsWith("http://localhost") ||
                uri.StartsWith("http://127.0.0.1") ||
                uri.StartsWith("data:") ||
                uri.StartsWith("blob:") ||
                uri.StartsWith("about:blank"))
            {
                return;
            }

            // Open external hyperlinks in the default OS browser
            e.Cancel = true;
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = e.Uri,
                    UseShellExecute = true
                });
            }
            catch {}
        }

        private void WebView_NavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess)
            {
                isSystemReady = true;
                splashPanel.Visible = false;
                errorPanel.Visible = false;
                webView.Visible = true;
            }
            else
            {
                if (!isSystemReady)
                {
                    ShowErrorState("Erro ao carregar o sistema (" + e.WebErrorStatus + ").");
                }
            }
        }

        private void CoreWebView2_DownloadStarting(object sender, CoreWebView2DownloadStartingEventArgs e)
        {
            // By default, downloads go to the user's standard Downloads folder or prompt naturally
            e.Handled = false;
        }

        private void ShowErrorState(string message)
        {
            splashPanel.Visible = false;
            webView.Visible = false;
            errorSubtitle.Text = message + "\nVerifique sua conexão com a internet e clique em Tentar Novamente.";
            errorPanel.Visible = true;
            errorPanel.BringToFront();
        }

        private void RetryConnection()
        {
            errorPanel.Visible = false;
            splashPanel.Visible = true;
            splashPanel.BringToFront();

            if (webView != null && webView.CoreWebView2 != null)
            {
                webView.CoreWebView2.Navigate(Config.ProductionUrl);
            }
            else
            {
                InitializeWebViewAsync();
            }
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            // F11: Alternar Tela Cheia
            if (keyData == Keys.F11)
            {
                if (FormBorderStyle == FormBorderStyle.None)
                {
                    FormBorderStyle = FormBorderStyle.Sizable;
                    WindowState = FormWindowState.Normal;
                }
                else
                {
                    FormBorderStyle = FormBorderStyle.None;
                    WindowState = FormWindowState.Maximized;
                }
                return true;
            }

            // F5 / Ctrl+R: Recarregar
            if (keyData == Keys.F5 || keyData == (Keys.Control | Keys.R))
            {
                if (webView != null && webView.CoreWebView2 != null)
                {
                    webView.CoreWebView2.Reload();
                }
                return true;
            }

            return base.ProcessCmdKey(ref msg, keyData);
        }
    }
}
