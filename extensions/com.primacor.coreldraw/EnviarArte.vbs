' =============================================================================
' PLMPackLib - PRIMACOR EMBALAGENS
' Macro: Enviar Arte do CorelDRAW para Visualização 3D
' Descrição: Exporta a arte da camada PLMPACKLIB_ARTE do CorelDRAW em 300 DPI
'            PNG (ocultando camadas técnicas) e envia para o renderizador 3D
'            Three.js do PLMPackLib Web via Bridge local.
' =============================================================================
Option Explicit

Const BRIDGE_URL = "http://127.0.0.1:48123"

Sub Main()
    Dim http, fso, tempFolder, pngPath
    Dim response, status
    
    ' 1. Verifica se a Bridge está online
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    On Error Resume Next
    http.Open "GET", BRIDGE_URL & "/api/status", False
    http.Send
    
    If Err.Number <> 0 Then
        MsgBox "A Bridge PLMPackLib não está em execução." & vbCrLf & vbCrLf & _
               "Inicie a Bridge com o comando:" & vbCrLf & _
               "  node bridge/server.cjs" & vbCrLf & vbCrLf & _
               "Ou acesse o PLMPackLib Web e clique em 'Conectar Bridge'.", _
               vbExclamation, "PLMPackLib - Bridge Offline"
        Exit Sub
    End If
    On Error GoTo 0
    
    If http.Status <> 200 Then
        MsgBox "A Bridge respondeu com status " & http.Status & ".", _
               vbExclamation, "PLMPackLib - Erro na Bridge"
        Exit Sub
    End If
    
    ' 2. Verifica se há um projeto ativo na Bridge
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    http.Open "GET", BRIDGE_URL & "/api/request-geometry", False
    http.Send
    
    If InStr(http.ResponseText, """success"":true") = 0 Then
        MsgBox "Nenhum projeto ativo na Bridge." & vbCrLf & _
               "Primeiro envie uma faca ao CorelDRAW pelo PLMPackLib Web.", _
               vbInformation, "PLMPackLib - Sem Projeto"
        Exit Sub
    End If
    
    ' 3. Verifica se o CorelDRAW tem documento aberto
    Dim app
    On Error Resume Next
    Set app = GetObject(, "CorelDRAW.Application.26")
    If Err.Number <> 0 Then
        Err.Clear
        Set app = GetObject(, "CorelDRAW.Application")
    End If
    On Error GoTo 0
    
    If app Is Nothing Then
        MsgBox "CorelDRAW não está aberto.", vbExclamation, "PLMPackLib"
        Exit Sub
    End If
    
    If app.Documents.Count = 0 Then
        MsgBox "Nenhum documento aberto no CorelDRAW." & vbCrLf & _
               "Primeiro envie uma faca pelo PLMPackLib Web.", _
               vbInformation, "PLMPackLib - Sem Documento"
        Exit Sub
    End If
    
    ' 4. Prepara o caminho temporário para exportação
    Set fso = CreateObject("Scripting.FileSystemObject")
    tempFolder = fso.GetSpecialFolder(2).Path ' %TEMP%
    pngPath = tempFolder & "\plmpack_bridge\artwork_export.png"
    
    ' Garante que a pasta existe
    If Not fso.FolderExists(tempFolder & "\plmpack_bridge") Then
        fso.CreateFolder(tempFolder & "\plmpack_bridge")
    End If
    
    ' Remove PNG antigo se existir
    If fso.FileExists(pngPath) Then
        fso.DeleteFile pngPath, True
    End If
    
    ' 5. Oculta camadas técnicas e exporta apenas a arte
    Dim doc, page, layer
    Set doc = app.ActiveDocument
    Set page = doc.ActivePage
    
    Dim techLayers(4)
    techLayers(0) = "PLMPACKLIB_CORTE"
    techLayers(1) = "PLMPACKLIB_VINCO"
    techLayers(2) = "PLMPACKLIB_PAINEIS"
    techLayers(3) = "PLMPACKLIB_COTAS"
    techLayers(4) = "PLMPACKLIB_REFERENCIA"
    
    ' Armazena visibilidade original
    Dim origVisible(4)
    Dim i, found
    For i = 0 To 4
        found = False
        For Each layer In page.Layers
            If layer.Name = techLayers(i) Then
                origVisible(i) = layer.Visible
                layer.Visible = False
                found = True
                Exit For
            End If
        Next
        If Not found Then origVisible(i) = False
    Next
    
    ' 6. Exporta o documento como PNG 300 DPI
    On Error Resume Next
    
    ' Usa exportação via shell PowerShell para melhor controle de parâmetros
    Dim wsh, psCmd, result
    Set wsh = CreateObject("WScript.Shell")
    
    psCmd = "powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command """ & _
            "$app = [System.Runtime.InteropServices.Marshal]::GetActiveObject('CorelDRAW.Application.26');" & _
            "$doc = $app.ActiveDocument;" & _
            "$page = $doc.ActivePage;" & _
            "foreach ($l in $page.Layers) {" & _
            "  if ($l.Name -eq 'PLMPACKLIB_CORTE' -or $l.Name -eq 'PLMPACKLIB_VINCO' -or " & _
            "      $l.Name -eq 'PLMPACKLIB_PAINEIS' -or $l.Name -eq 'PLMPACKLIB_COTAS' -or " & _
            "      $l.Name -eq 'PLMPACKLIB_REFERENCIA') { $l.Visible = $false }" & _
            "};" & _
            "$opt = $doc.CreateStructExportOptions();" & _
            "$opt.ImageType = 5;" & _
            "$opt.ResolutionX = 300;" & _
            "$opt.ResolutionY = 300;" & _
            "$opt.AntiAliasingType = 1;" & _
            "$opt.Overwrite = $true;" & _
            "$doc.ExportEx('" & Replace(pngPath, "'", "''") & "', 1284, 0, $opt);" & _
            "foreach ($l in $page.Layers) {" & _
            "  if ($l.Name -eq 'PLMPACKLIB_CORTE' -or $l.Name -eq 'PLMPACKLIB_VINCO' -or " & _
            "      $l.Name -eq 'PLMPACKLIB_PAINEIS' -or $l.Name -eq 'PLMPACKLIB_COTAS' -or " & _
            "      $l.Name -eq 'PLMPACKLIB_REFERENCIA') { $l.Visible = $true }" & _
            "};" & _
            "Write-Host 'OK'"""
    
    result = wsh.Run(psCmd, 0, True)
    On Error GoTo 0
    
    ' 7. Restaura visibilidade original
    For i = 0 To 4
        For Each layer In page.Layers
            If layer.Name = techLayers(i) Then
                layer.Visible = origVisible(i)
                Exit For
            End If
        Next
    Next
    
    ' 8. Verifica se o PNG foi gerado e envia para a Bridge
    WScript.Sleep 1500
    
    If Not fso.FileExists(pngPath) Then
        MsgBox "Falha ao exportar a arte do CorelDRAW." & vbCrLf & _
               "Verifique se há conteúdo na camada PLMPACKLIB_ARTE.", _
               vbExclamation, "PLMPackLib - Erro na Exportação"
        Exit Sub
    End If
    
    ' Lê o PNG como base64 e envia via POST
    Dim stream, bytes, base64
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 1 ' Binary
    stream.Open
    stream.LoadFromFile pngPath
    bytes = stream.Read
    stream.Close
    
    ' Converte para Base64
    Dim dom, elem
    Set dom = CreateObject("MSXML2.DOMDocument.6.0")
    Set elem = dom.CreateElement("tmp")
    elem.DataType = "bin.base64"
    elem.NodeTypedValue = bytes
    base64 = Replace(Replace(elem.Text, vbCr, ""), vbLf, "")
    
    Dim dataUri
    dataUri = "data:image/png;base64," & base64
    
    ' 9. Envia a arte para a Bridge (POST /api/artwork)
    Dim postBody
    postBody = "{""textureDataUri"":""" & dataUri & """}"
    
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    http.Open "POST", BRIDGE_URL & "/api/artwork", False
    http.SetRequestHeader "Content-Type", "application/json"
    http.Send postBody
    
    If http.Status = 200 Then
        MsgBox "Arte enviada com sucesso!" & vbCrLf & vbCrLf & _
               "Abra o PLMPackLib Web para ver a visualização 3D" & vbCrLf & _
               "com sua arte mapeada nos painéis da embalagem.", _
               vbInformation, "PLMPackLib - Arte Sincronizada"
    Else
        MsgBox "Falha ao enviar arte para a Bridge." & vbCrLf & _
               "Status: " & http.Status & vbCrLf & _
               "Resposta: " & http.ResponseText, _
               vbExclamation, "PLMPackLib - Erro"
    End If
End Sub

Main
