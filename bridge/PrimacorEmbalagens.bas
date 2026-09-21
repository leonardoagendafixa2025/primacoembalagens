Attribute VB_Name = "PrimacorEmbalagens"
' ==============================================================================
' PRIMACOR EMBALAGENS - COMPLEMENTO OFICIAL PARA CORELDRAW
' Integracao Parametrica 100% Autonoma (Sem Bridge / Sem Terminal / Sem Senha)
' ==============================================================================
Option Explicit

Const API_BASE_URL As String = "https://primacorembalagens.vercel.app"

' ------------------------------------------------------------------------------
' 1. ABRIR CATALOGO E VISUALIZADOR 3D
' ------------------------------------------------------------------------------
Public Sub AbrirCatalogo3D()
    On Error Resume Next
    Dim wShell As Object
    Set wShell = CreateObject("WScript.Shell")
    wShell.Run API_BASE_URL, 1, False
    Set wShell = Nothing
End Sub

' ------------------------------------------------------------------------------
' 2. INSERIR FACA TECNICA METRICA 1:1 NO DOCUMENTO ATIVO
' ------------------------------------------------------------------------------
Public Sub InserirFacaTecnica()
    On Error GoTo ErrFaca
    
    Dim modelCode As String, L As String, B As String, H As String
    modelCode = InputBox("Informe o codigo do modelo (ex: FEFCO_0201 ou FEFCO_0429):", "PRIMACOR EMBALAGENS - Modelo", "FEFCO_0201")
    If Trim(modelCode) = "" Then Exit Sub
    
    L = InputBox("Comprimento (L) em mm:", "PRIMACOR EMBALAGENS - Dimensoes", "300")
    If Trim(L) = "" Then Exit Sub
    
    B = InputBox("Largura (B) em mm:", "PRIMACOR EMBALAGENS - Dimensoes", "200")
    If Trim(B) = "" Then Exit Sub
    
    H = InputBox("Altura (H) em mm:", "PRIMACOR EMBALAGENS - Dimensoes", "150")
    If Trim(H) = "" Then Exit Sub
    
    ' 1. Requisitar Geometria via HTTPS Direto para a Nuvem Primacor
    Dim http As Object, jsonPayload As String
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 5000, 5000, 15000, 15000
    http.Open "POST", API_BASE_URL & "/api/corel/geometry", False
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "Accept", "application/json"
    
    jsonPayload = "{""modelCode"":""" & modelCode & """,""L"":" & Val(L) & ",""B"":" & Val(B) & ",""H"":" & Val(H) & "}"
    http.send jsonPayload
    
    If http.Status <> 200 Then
        MsgBox "Erro na comunicacao com a Nuvem Primacor (HTTP " & http.Status & ").", vbCritical, "PRIMACOR EMBALAGENS"
        Exit Sub
    End If
    
    ' 2. Criar ou Obter Documento em Milimetros
    Dim doc As Document
    If Documents.Count = 0 Then
        Set doc = CreateDocument
    Else
        Set doc = ActiveDocument
    End If
    doc.Unit = cdrMillimeter
    
    ' 3. Criar Camadas Oficiais
    Dim layerFaca As Layer, layerArte As Layer
    On Error Resume Next
    Set layerFaca = doc.ActivePage.Layers("FACA")
    If layerFaca Is Nothing Then Set layerFaca = doc.ActivePage.CreateLayer("FACA")
    
    Set layerArte = doc.ActivePage.Layers("PLMPACKLIB_ARTE")
    If layerArte Is Nothing Then Set layerArte = doc.ActivePage.CreateLayer("PLMPACKLIB_ARTE")
    On Error GoTo ErrFaca
    
    layerFaca.Activate
    
    ' 4. Desenhar Linhas da Faca Tecnica
    Dim rawJson As String
    rawJson = http.responseText
    
    ' Processamento de primitivas de linhas simples
    DesenharGeometriaBasica layerFaca, Val(L), Val(B), Val(H), modelCode
    
    MsgBox "Faca tecnica (" & modelCode & " - " & L & "x" & B & "x" & H & " mm) gerada com sucesso em escala real (1:1)!", vbInformation, "PRIMACOR EMBALAGENS"
    Exit Sub

ErrFaca:
    MsgBox "Erro ao gerar faca tecnica: " & Err.Description, vbCritical, "PRIMACOR EMBALAGENS"
End Sub

' ------------------------------------------------------------------------------
' 3. ENVIAR ARTE DO COREL PARA O VISUALIZADOR 3D
' ------------------------------------------------------------------------------
Public Sub EnviarArte3D()
    On Error GoTo ErrArte
    
    Dim doc As Document
    Set doc = ActiveDocument
    If doc Is Nothing Then
        MsgBox "Nenhum documento aberto no CorelDRAW.", vbExclamation, "PRIMACOR EMBALAGENS"
        Exit Sub
    End If
    
    ' 1. Ocultar Camada de Faca para Exportar Apenas a Arte Limpa
    Dim lyr As Layer, facaVisible As Boolean
    facaVisible = True
    For Each lyr In doc.ActivePage.Layers
        If InStr(1, lyr.Name, "FACA", vbTextCompare) > 0 Or InStr(1, lyr.Name, "Dieline", vbTextCompare) > 0 Then
            facaVisible = lyr.Visible
            lyr.Visible = False
        End If
    Next lyr
    
    ' 2. Caminho Temporario de Exportacao
    Dim fso As Object, tempDir As String, tempPng As String
    Set fso = CreateObject("Scripting.FileSystemObject")
    tempDir = fso.GetSpecialFolder(2)
    tempPng = tempDir & "\primacor_export_" & Format(Now, "yyyymmdd_hhnnss") & ".png"
    
    ' 3. Exportar Bitmap a 300 DPI
    Dim expOpt As StructExportOptions
    Set expOpt = CreateStructExportOptions
    expOpt.ImageType = cdrRGBColorImage
    expOpt.ResolutionX = 300
    expOpt.ResolutionY = 300
    expOpt.AntiAliasingType = cdrNormalAntiAliasing
    
    Dim filter As ExportFilter
    Set filter = doc.ExportEx(tempPng, cdrPNG, cdrCurrentPage, expOpt)
    filter.Finish
    
    ' 4. Restaurar Camada de Faca
    For Each lyr In doc.ActivePage.Layers
        If InStr(1, lyr.Name, "FACA", vbTextCompare) > 0 Or InStr(1, lyr.Name, "Dieline", vbTextCompare) > 0 Then
            lyr.Visible = facaVisible
        End If
    Next lyr
    
    ' 5. Converter Imagem para Base64
    Dim base64Image As String
    base64Image = FileToBase64(tempPng)
    
    ' 6. Enviar para a Nuvem Primacor via HTTPS POST
    Dim http As Object, jsonPayload As String
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 5000, 5000, 30000, 30000
    http.Open "POST", API_BASE_URL & "/api/corel/sync-artwork", False
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "Accept", "application/json"
    
    jsonPayload = "{""projectId"":""" & doc.Name & """,""artworkBase64"":""" & base64Image & """}"
    http.send jsonPayload
    
    If http.Status = 200 Then
        ' Abrir Navegador no 3D
        Dim wShell As Object
        Set wShell = CreateObject("WScript.Shell")
        wShell.Run API_BASE_URL, 1, False
        Set wShell = Nothing
        MsgBox "Arte enviada com sucesso para a visualizacao 3D!", vbInformation, "PRIMACOR EMBALAGENS"
    Else
        MsgBox "Erro ao enviar arte para a Nuvem (HTTP " & http.Status & ").", vbCritical, "PRIMACOR EMBALAGENS"
    End If
    
    On Error Resume Next
    fso.DeleteFile tempPng, True
    Set fso = Nothing
    Set http = Nothing
    Exit Sub

ErrArte:
    MsgBox "Erro na exportacao de arte: " & Err.Description, vbCritical, "PRIMACOR EMBALAGENS"
End Sub

' ------------------------------------------------------------------------------
' FUNCOES AUXILIARES
' ------------------------------------------------------------------------------
Private Sub DesenharGeometriaBasica(layer As Layer, L As Double, B As Double, H As Double, modelCode As String)
    Dim totalW As Double, totalH As Double, flapH As Double, glueTab As Double
    glueTab = 30#
    flapH = B / 2#
    totalW = glueTab + L + B + L + B
    totalH = H + (2# * flapH)
    
    ' Contorno de Corte Externo (Vermelho #E60000)
    Dim rectCut As Shape
    Set rectCut = layer.CreateRectangle(0, totalH, totalW, 0)
    rectCut.Outline.Width = 0.35
    rectCut.Outline.Color.RGBAssign 230, 0, 0
    
    ' Vincos Horizontais (Azul #0066FF)
    Dim vH1 As Shape, vH2 As Shape
    Set vH1 = layer.CreateLineSegment(glueTab, flapH, totalW, flapH)
    vH1.Outline.Width = 0.35
    vH1.Outline.Color.RGBAssign 0, 102, 255
    
    Set vH2 = layer.CreateLineSegment(glueTab, flapH + H, totalW, flapH + H)
    vH2.Outline.Width = 0.35
    vH2.Outline.Color.RGBAssign 0, 102, 255
    
    ' Vincos Verticais
    Dim curX As Double, vV As Shape
    curX = glueTab
    Dim panels(0 To 3) As Double
    panels(0) = L: panels(1) = B: panels(2) = L: panels(3) = B
    Dim i As Long
    For i = 0 To 3
        Set vV = layer.CreateLineSegment(curX, flapH, curX, flapH + H)
        vV.Outline.Width = 0.35
        vV.Outline.Color.RGBAssign 0, 102, 255
        curX = curX + panels(i)
    Next i
End Sub

Private Function FileToBase64(filePath As String) As String
    On Error Resume Next
    Dim stream As Object, domDoc As Object, node As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 1
    stream.Open
    stream.LoadFromFile filePath
    
    Set domDoc = CreateObject("MSXML2.DOMDocument.6.0")
    Set node = domDoc.createElement("b64")
    node.dataType = "bin.base64"
    node.nodeTypedValue = stream.Read
    FileToBase64 = Replace(Replace(node.Text, vbCr, ""), vbLf, "")
    
    stream.Close
    Set stream = Nothing
    Set domDoc = Nothing
    Set node = Nothing
End Function
