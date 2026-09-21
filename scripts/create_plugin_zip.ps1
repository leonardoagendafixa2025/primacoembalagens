$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extSrc = Join-Path $repoRoot "extensions\com.primacor.plmpacklib"
$distDir = Join-Path $repoRoot "dist_plugin"
$packageDir = Join-Path $distDir "Plugin_Illustrator_Primacor"
$targetZip = Join-Path $repoRoot "web\public\downloads\Plugin_Illustrator_Primacor.zip"
$downloadsDir = Join-Path $repoRoot "web\public\downloads"

Write-Host "0. Compilando studio.bundle.js em formato IIFE puro..."
$esbuildCmd = "npx.cmd esbuild `"$repoRoot\web\src\integrations\illustrator\cepStudioEntry.ts`" --bundle --format=iife --target=es2020 --platform=browser --outfile=`"$extSrc\js\studio.bundle.js`""
Invoke-Expression $esbuildCmd
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao compilar studio.bundle.js com esbuild"
}

Write-Host "1. Preparando pastas de distribuição..."
if (Test-Path $distDir) {
    Remove-Item $distDir -Recurse -Force
}
New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null

$extDest = Join-Path $packageDir "com.primacor.plmpacklib"
New-Item -ItemType Directory -Path $extDest -Force | Out-Null

Write-Host "2. Copiando arquivos da extensão..."
Copy-Item -Path (Join-Path $extSrc "*") -Destination $extDest -Recurse -Force

# Também atualiza a instalação local do desenvolvedor se existir a pasta
$localDevCEP = "$env:APPDATA\Adobe\CEP\extensions\com.primacor.plmpacklib"
if (Test-Path "$env:APPDATA\Adobe\CEP\extensions") {
    Write-Host "   Atualizando pasta local do Illustrator ($localDevCEP)..."
    if (-not (Test-Path $localDevCEP)) {
        New-Item -ItemType Directory -Path $localDevCEP -Force | Out-Null
    }
    Copy-Item -Path (Join-Path $extSrc "*") -Destination $localDevCEP -Recurse -Force
}

Write-Host "3. Criando instalador Windows (.bat)..."
$batContent = @"
@echo off
chcp 65001 >nul
title Instalador Oficial - Plugin PRIMACOR EMBALAGENS para Adobe Illustrator
color 0A

echo =====================================================================
echo    INSTALADOR OFICIAL: PRIMACOR EMBALAGENS - ADOBE ILLUSTRATOR
echo =====================================================================
echo.
echo 1. Habilitando modo de desenvolvedor de extensoes no registro...

reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.7" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.8" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.13" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.14" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.15" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.16" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.17" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.18" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1

echo    [OK] Modo de desenvolvedor ativado com sucesso.
echo.
echo 2. Instalando arquivos do plugin na pasta oficial da Adobe...

set "TARGET_DIR=%APPDATA%\Adobe\CEP\extensions\com.primacor.plmpacklib"

if not exist "%TARGET_DIR%" (
    mkdir "%TARGET_DIR%" >nul 2>&1
)

xcopy /E /Y /I "%~dp0com.primacor.plmpacklib\*" "%TARGET_DIR%\" >nul

if %ERRORLEVEL% equ 0 (
    echo    [OK] Arquivos instalados com sucesso em:
    echo         %TARGET_DIR%
    echo.
    echo =====================================================================
    echo    INSTALACAO CONCLUIDA COM SUCESSO!
    echo =====================================================================
    echo.
    echo Como usar:
    echo 1. Abra (ou reinicie) o Adobe Illustrator.
    echo 2. Acesse o menu superior:
    echo    Janela (Window) ^> Extensoes (Extensions) ^> PRIMACOR EMBALAGENS.
    echo 3. O painel interativo 3D com sincronizacao de arte abrira no Illustrator!
    echo.
) else (
    echo    [ERRO] Falha ao copiar arquivos. Verifique permissoes de usuario.
)

echo.
pause
"@

[System.IO.File]::WriteAllText((Join-Path $packageDir "Instalar_Plugin_Windows.bat"), $batContent, [System.Text.Encoding]::GetEncoding(1252))

Write-Host "4. Criando instalador Mac (.command)..."
$shContent = @"
#!/bin/bash
echo "====================================================================="
echo "   INSTALADOR OFICIAL: PRIMACOR EMBALAGENS - ADOBE ILLUSTRATOR (MAC)"
echo "====================================================================="
echo ""

for v in 7 8 9 10 11 12 13 14 15 16 17 18; do
  defaults write com.adobe.CSXS.`$v PlayerDebugMode 1 2>/dev/null
done

TARGET_DIR="`$HOME/Library/Application Support/Adobe/CEP/extensions/com.primacor.plmpacklib"
mkdir -p "`$TARGET_DIR"

DIR="`$( cd "`$( dirname "`"${BASH_SOURCE[0]}"`" )" && pwd )"
cp -R "`$DIR/com.primacor.plmpacklib/"* "`$TARGET_DIR/"

echo "[OK] Plugin instalado com sucesso em:"
echo "     `$TARGET_DIR"
echo ""
echo "Como usar:"
echo "1. Abra (ou reinicie) o Adobe Illustrator."
echo "2. Acesse: Janela (Window) > Extensoes (Extensions) > PRIMACOR EMBALAGENS."
echo ""
read -p "Pressione Enter para fechar..."
"@

[System.IO.File]::WriteAllText((Join-Path $packageDir "Instalar_Plugin_Mac.command"), $shContent, [System.Text.Encoding]::UTF8)

Write-Host "5. Criando manual de instrucoes..."
$txtContent = @"
=====================================================================
  GUIA RAPIDO — INSTALACAO DO PLUGIN PRIMACOR EMBALAGENS
=====================================================================

Compatibilidade: Adobe Illustrator CC 2019 ate Illustrator 2025 / 2026.
Sistemas: Windows 10/11 e macOS.

---------------------------------------------------------------------
INSTALACAO NO WINDOWS (1 CLIQUE):
---------------------------------------------------------------------
1. Feche o Adobe Illustrator se estiver aberto.
2. De um duplo clique no arquivo:
   "Instalar_Plugin_Windows.bat"
3. O instalador copiará os arquivos automaticamente para a pasta oficial
   do Illustrator (%APPDATA%\Adobe\CEP\extensions\com.primacor.plmpacklib)
   e ativará a permissão necessária.
4. Abra o Adobe Illustrator.
5. No menu superior, clique em:
   Janela (Window) > Extensões (Extensions) > PRIMACOR EMBALAGENS.
6. Pronto! O estúdio 3D abrirá perfeitamente configurado.

---------------------------------------------------------------------
INSTALACAO NO MAC:
---------------------------------------------------------------------
1. De um duplo clique no arquivo "Instalar_Plugin_Mac.command".
2. Abra o Illustrator e acesse Janela > Extensões > PRIMACOR EMBALAGENS.
=====================================================================
"@

[System.IO.File]::WriteAllText((Join-Path $packageDir "COMO_INSTALAR.txt"), $txtContent, [System.Text.Encoding]::UTF8)

Write-Host "6. Gerando arquivo compactado ZIP..."
if (Test-Path $targetZip) {
    Remove-Item $targetZip -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($packageDir, $targetZip)

Write-Host "[SUCESSO] ZIP criado em:" $targetZip
$zipSize = (Get-Item $targetZip).Length / 1MB
Write-Host "Tamanho do ZIP: $($zipSize.ToString('F2')) MB"
