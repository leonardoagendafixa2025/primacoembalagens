' =============================================================================
' PLMPackLib - PRIMACOR EMBALAGENS
' Macro: Abrir Visualização 3D no Navegador
' Descrição: Abre o PLMPackLib Web (https://primacorembalagens.vercel.app)
'            no navegador padrão para visualização 3D interativa da embalagem.
' =============================================================================
Option Explicit

Sub Main()
    Dim wsh
    Set wsh = CreateObject("WScript.Shell")
    wsh.Run "https://primacorembalagens.vercel.app", 1, False
End Sub

Main
