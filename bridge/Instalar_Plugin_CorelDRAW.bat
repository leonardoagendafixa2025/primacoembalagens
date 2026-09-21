@echo off
chcp 65001 >nul
title Instalador do Plugin - PRIMACOR EMBALAGENS

echo ================================================================
echo           PRIMACOR EMBALAGENS - PLUGIN PARA CORELDRAW           
echo ================================================================
echo.
echo Localizando instalacoes do CorelDRAW no seu computador...
echo.

set INSTALLED=0
set SOURCE_GMS=%~dp0PrimacorEmbalagens.gms

if not exist "%SOURCE_GMS%" (
    echo [ERRO] Arquivo PrimacorEmbalagens.gms nao encontrado na pasta do instalador.
    pause
    exit /b 1
)

for /d %%D in ("%APPDATA%\Corel\CorelDRAW*") do (
    if exist "%%D\Draw" (
        if not exist "%%D\Draw\GMS" mkdir "%%D\Draw\GMS"
        copy /y "%SOURCE_GMS%" "%%D\Draw\GMS\PrimacorEmbalagens.gms" >nul
        echo [OK] Plugin instalado com sucesso em: %%~nxD
        set INSTALLED=1
    )
)

if "%INSTALLED%"=="1" (
    echo.
    echo ================================================================
    echo     SUCESSO! O Plugin PRIMACOR EMBALAGENS foi instalado!        
    echo ================================================================
    echo.
    echo Como usar:
    echo 1. Abra o CorelDRAW.
    echo 2. Acesse: Menu Ferramentas ^> Scripts / Macros ^> Gerenciador de Scripts.
    echo 3. O projeto 'PrimacorEmbalagens' estara disponivel para uso!
    echo.
) else (
    echo [AVISO] Nenhuma pasta padrao do CorelDRAW encontrada em AppData.
    echo Criando pasta padrao para o CorelDRAW...
    mkdir "%APPDATA%\Corel\CorelDRAW Graphics Suite 2025\Draw\GMS" 2>nul
    copy /y "%SOURCE_GMS%" "%APPDATA%\Corel\CorelDRAW Graphics Suite 2025\Draw\GMS\PrimacorEmbalagens.gms" >nul
    echo [OK] Plugin instalado na pasta padrao do CorelDRAW 2025.
)

echo.
pause
