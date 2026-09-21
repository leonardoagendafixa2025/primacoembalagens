Attribute VB_Name = "PrimacorEmbalagens"
' ==============================================================================
' PRIMACOR EMBALAGENS - Plugin Oficial para CorelDRAW (2019 - 2025+)
' Integração Paramétrica de Facas Técnicas e Visualização 3D em Tempo Real
' ==============================================================================
Option Explicit

Const PRIMACOR_URL As String = "https://primacorembalagens.vercel.app"
Const BRIDGE_URL As String = "http://127.0.0.1:48123"

' ------------------------------------------------------------------------------
' 1. ABRIR CATÁLOGO E VISUALIZADOR 3D
' ------------------------------------------------------------------------------
Public Sub AbrirCatalogo3D()
    On Error Resume Next
    Dim wShell As Object
    Set wShell = CreateObject("WScript.Shell")
    wShell.Run PRIMACOR_URL, 1, False
    Set wShell = Nothing
End Sub

' ------------------------------------------------------------------------------
' 2. SINCRONIZAR ARTE DO DOCUMENTO ATIVO COM O 3D
' ------------------------------------------------------------------------------
Public Sub SincronizarArteCom3D()
    On Error GoTo ErrHandler
    
    Dim doc As Document
    Set doc = ActiveDocument
    If doc Is Nothing Then
        MsgBox "Nenhum documento aberto no CorelDRAW.", vbExclamation, "PRIMACOR EMBALAGENS"
        Exit Sub
    End If
    
    ' Ocultar camadas técnicas de Faca para exportar somente a arte limpa
    Dim lyr As Layer, layerStates() As Boolean, i As Long
    ReDim layerStates(1 To doc.ActivePage.Layers.Count)
    
    For i = 1 To doc.ActivePage.Layers.Count
        Set lyr = doc.ActivePage.Layers(i)
        layerStates(i) = lyr.Visible
        If InStr(1, lyr.Name, "Faca", vbTextCompare) > 0 Or _
           InStr(1, lyr.Name, "Dieline", vbTextCompare) > 0 Or _
           InStr(1, lyr.Name, "Corte", vbTextCompare) > 0 Or _
           InStr(1, lyr.Name, "Vinco", vbTextCompare) > 0 Then
            lyr.Visible = False
        End If
    Next i
    
    ' Gerar caminho temporário de exportação
    Dim fso As Object, tempDir As String, tempPng As String
    Set fso = CreateObject("Scripting.FileSystemObject")
    tempDir = fso.GetSpecialFolder(2)
    tempPng = tempDir & "\primacor_art_" & Format(Now, "yyyymmdd_hhnnss") & ".png"
    
    ' Configurar exportação de alta resolução (300 DPI)
    Dim expOpt As StructExportOptions
    Set expOpt = CreateStructExportOptions
    expOpt.ImageType = cdrRGBColorImage
    expOpt.ResolutionX = 300
    expOpt.ResolutionY = 300
    expOpt.AntiAliasingType = cdrNormalAntiAliasing
    
    Dim expFilter As ExportFilter
    Set expFilter = doc.ExportEx(tempPng, cdrPNG, cdrCurrentPage, expOpt)
    expFilter.Finish
    
    ' Restaurar visibilidade original das camadas
    For i = 1 To doc.ActivePage.Layers.Count
        doc.ActivePage.Layers(i).Visible = layerStates(i)
    Next i
    
    ' Converter PNG em Base64
    Dim base64Png As String
    base64Png = ConvertFileToBase64(tempPng)
    
    ' Enviar arte via HTTP
    Dim http As Object, jsonPayload As String
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "POST", BRIDGE_URL & "/api/coreldraw/artwork", False
    http.setRequestHeader "Content-Type", "application/json"
    
    jsonPayload = "{""source"":""coreldraw"",""projectId"":""" & doc.Name & """,""artworkBase64"":""" & base64Png & """}"
    http.send jsonPayload
    
    If http.Status = 200 Then
        MsgBox "Arte enviada com sucesso para a visualização 3D da PRIMACOR EMBALAGENS!", vbInformation, "PRIMACOR EMBALAGENS"
    Else
        MsgBox "Arte exportada, mas a conexão local não respondeu (HTTP " & http.Status & ").", vbExclamation, "PRIMACOR EMBALAGENS"
    End If
    
    On Error Resume Next
    fso.DeleteFile tempPng, True
    Set fso = Nothing
    Set http = Nothing
    Exit Sub

ErrHandler:
    MsgBox "Erro ao sincronizar arte: " & Err.Description, vbCritical, "PRIMACOR EMBALAGENS"
End Sub

' ------------------------------------------------------------------------------
' 3. STATUS DA CONEXÃO PRIMACOR
' ------------------------------------------------------------------------------
Public Sub VerificarConexao()
    On Error GoTo ErrNet
    Dim http As Object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.Open "GET", BRIDGE_URL & "/api/status", False
    http.send
    
    If http.Status = 200 Then
        MsgBox "Conexão com a PRIMACOR EMBALAGENS ativa e pronta para uso!", vbInformation, "PRIMACOR EMBALAGENS"
    Else
        MsgBox "Status de resposta da conexão: " & http.Status, vbExclamation, "PRIMACOR EMBALAGENS"
    End If
    Set http = Nothing
    Exit Sub

ErrNet:
    MsgBox "Não foi possível conectar. Abra o portal web da PRIMACOR EMBALAGENS para iniciar.", vbExclamation, "PRIMACOR EMBALAGENS"
End Sub

' ------------------------------------------------------------------------------
' FUNÇÃO AUXILIAR: ARQUIVO PARA BASE64
' ------------------------------------------------------------------------------
Private Function ConvertFileToBase64(filePath As String) As String
    On Error Resume Next
    Dim stream As Object, domDoc As Object, node As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 1 ' Binário
    stream.Open
    stream.LoadFromFile filePath
    
    Set domDoc = CreateObject("MSXML2.DOMDocument.6.0")
    Set node = domDoc.createElement("b64")
    node.dataType = "bin.base64"
    node.nodeTypedValue = stream.Read
    ConvertFileToBase64 = Replace(Replace(node.Text, vbCr, ""), vbLf, "")
    
    stream.Close
    Set stream = Nothing
    Set domDoc = Nothing
    Set node = Nothing
End Function
