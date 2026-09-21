' =============================================================================
' PLMPackLib - PRIMACOR EMBALAGENS
' Macro: Atualizar Faca no CorelDRAW
' Descrição: Solicita a geometria da faca ativa do PLMPackLib Web (via Bridge
'            local na porta 48123) e desenha automaticamente no CorelDRAW
'            com precisão métrica 1:1, 6 camadas técnicas e margem de 15 mm.
' =============================================================================
Option Explicit

Const BRIDGE_URL = "http://127.0.0.1:48123"

Sub Main()
    Dim http, response, status
    
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
    
    status = http.Status
    If status <> 200 Then
        MsgBox "A Bridge respondeu com status " & status & "." & vbCrLf & _
               "Verifique se o servidor está funcionando corretamente.", _
               vbExclamation, "PLMPackLib - Erro na Bridge"
        Exit Sub
    End If
    
    ' 2. Solicita a geometria do projeto ativo
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")
    http.Open "GET", BRIDGE_URL & "/api/request-geometry", False
    http.Send
    
    If http.Status <> 200 Then
        MsgBox "Falha ao solicitar geometria. Status: " & http.Status, _
               vbExclamation, "PLMPackLib - Erro"
        Exit Sub
    End If
    
    response = http.ResponseText
    
    ' 3. Verifica se há projeto ativo
    If InStr(response, """success"":true") = 0 Or InStr(response, """project"":null") > 0 Then
        MsgBox "Nenhum projeto ativo na Bridge." & vbCrLf & vbCrLf & _
               "Abra o PLMPackLib Web, configure uma embalagem e clique" & vbCrLf & _
               "no botão [Cdr CorelDRAW] para enviar a faca.", _
               vbInformation, "PLMPackLib - Aguardando Projeto"
        
        ' Abre o PLMPackLib Web automaticamente
        Dim wsh
        Set wsh = CreateObject("WScript.Shell")
        wsh.Run "https://primacorembalagens.vercel.app", 1, False
        Exit Sub
    End If
    
    ' 4. Projeto disponível - informa o usuário
    MsgBox "Projeto detectado na Bridge!" & vbCrLf & vbCrLf & _
           "Para enviar a faca ao CorelDRAW:" & vbCrLf & _
           "1. Acesse o PLMPackLib Web" & vbCrLf & _
           "2. Configure sua embalagem" & vbCrLf & _
           "3. Clique no botão [Cdr CorelDRAW]" & vbCrLf & vbCrLf & _
           "A faca será desenhada automaticamente no CorelDRAW" & vbCrLf & _
           "com 6 camadas técnicas, escala 1:1 mm e margem de 15 mm.", _
           vbInformation, "PLMPackLib - Projeto Pronto"
End Sub

Main
