' =============================================================================
' PLMPackLib - PRIMACOR EMBALAGENS
' Barra de Ferramentas: PLMPackLib Toolbar para CorelDRAW
' Descrição: Exibe uma janela compacta com os 3 botões oficiais da integração
'            PLMPackLib: Atualizar Faca, Enviar Arte e Abrir 3D.
'            Execute este script dentro do CorelDRAW (Ferramentas > Macros)
'            ou crie um atalho na área de trabalho.
' =============================================================================
Option Explicit

Sub Main()
    Dim ie
    Set ie = CreateObject("InternetExplorer.Application")
    
    ie.Navigate "about:blank"
    Do While ie.Busy Or ie.ReadyState <> 4
        WScript.Sleep 100
    Loop
    
    ie.Width = 380
    ie.Height = 260
    ie.Left = 100
    ie.Top = 100
    ie.MenuBar = False
    ie.ToolBar = False
    ie.StatusBar = False
    ie.Resizable = False
    ie.Visible = True
    
    Dim html
    html = "<!DOCTYPE html><html><head>" & _
           "<title>PLMPackLib - PRIMACOR</title>" & _
           "<style>" & _
           "* { margin:0; padding:0; box-sizing:border-box; font-family:'Segoe UI',Tahoma,sans-serif; }" & _
           "body { background:#111827; color:#f1f5f9; padding:16px; display:flex; flex-direction:column; gap:10px; }" & _
           "h1 { font-size:14px; font-weight:700; color:#22c55e; text-align:center; letter-spacing:0.5px; }" & _
           ".badge { font-size:10px; color:#94a3b8; text-align:center; margin-top:-6px; }" & _
           ".btn { width:100%; padding:12px 16px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; " & _
           "  background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%); color:#e2e8f0; font-size:13px; " & _
           "  font-weight:600; cursor:pointer; display:flex; align-items:center; gap:10px; " & _
           "  transition:all 0.15s; }" & _
           ".btn:hover { background:#22c55e; color:#000; border-color:#22c55e; }" & _
           ".icon { font-size:18px; }" & _
           "</style></head><body>" & _
           "<h1>PRIMACOR EMBALAGENS</h1>" & _
           "<div class='badge'>Plugin Oficial CorelDRAW</div>" & _
           "<button class='btn' onclick=""runVbs('AtualizarFaca')""><span class='icon'>📐</span> Atualizar Faca</button>" & _
           "<button class='btn' onclick=""runVbs('EnviarArte')""><span class='icon'>🎨</span> Enviar Arte → 3D</button>" & _
           "<button class='btn' onclick=""runVbs('Abrir3D')""><span class='icon'>📦</span> Abrir 3D Web</button>" & _
           "<script>" & _
           "function runVbs(name) {" & _
           "  var wsh = new ActiveXObject('WScript.Shell');" & _
           "  var baseDir = wsh.RegRead('HKCU\\Software\\PLMPackLib\\PluginPath');" & _
           "  if (!baseDir) baseDir = wsh.ExpandEnvironmentStrings('%APPDATA%') + '\\PLMPackLib\\CorelDRAW';" & _
           "  wsh.Run('wscript.exe ""' + baseDir + '\\' + name + '.vbs""', 0, false);" & _
           "}" & _
           "</script></body></html>"
    
    ie.Document.Open
    ie.Document.Write html
    ie.Document.Close
End Sub

Main
