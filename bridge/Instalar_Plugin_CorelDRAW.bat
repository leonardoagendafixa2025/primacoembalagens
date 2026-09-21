@echo off
chcp 65001 >nul
title Instalador Oficial do Complemento - PRIMACOR EMBALAGENS

echo ================================================================
echo           PRIMACOR EMBALAGENS - COMPLEMENTO CORELDRAW           
echo ================================================================
echo.
echo [1/3] Verificando instalacoes do CorelDRAW...
echo.

set SOURCE_GMS=%~dp0PrimacorEmbalagens.gms
set FOUND=0

if not exist "%SOURCE_GMS%" (
    echo [ERRO] Arquivo PrimacorEmbalagens.gms nao encontrado neste diretorio.
    echo Certifique-se de extrair todos os arquivos do ZIP antes de executar.
    pause
    exit /b 1
)

:: 1. Procurar todas as pastas do CorelDRAW em AppData
for /d %%D in ("%APPDATA%\Corel\CorelDRAW*") do (
    if exist "%%D\Draw" (
        if not exist "%%D\Draw\GMS" mkdir "%%D\Draw\GMS"
        copy /y "%SOURCE_GMS%" "%%D\Draw\GMS\PrimacorEmbalagens.gms" >nul
        echo [OK] Complemento instalado com sucesso em: %%~nxD
        set FOUND=1
    )
)

:: 2. Se nenhuma pasta foi detectada automaticamente, criar para a versao padrao
if "%FOUND%"=="0" (
    echo [INFO] Configurando pasta padrao para o CorelDRAW Graphics Suite...
    mkdir "%APPDATA%\Corel\CorelDRAW Graphics Suite 2025\Draw\GMS" 2>nul
    mkdir "%APPDATA%\Corel\CorelDRAW Graphics Suite 2024\Draw\GMS" 2>nul
    mkdir "%APPDATA%\Corel\CorelDRAW Graphics Suite 2023\Draw\GMS" 2>nul
    mkdir "%APPDATA%\Corel\CorelDRAW Graphics Suite 2022\Draw\GMS" 2>nul
    mkdir "%APPDATA%\Corel\CorelDRAW Graphics Suite 2021\Draw\GMS" 2>nul
    copy /y "%SOURCE_GMS%" "%APPDATA%\Corel\CorelDRAW Graphics Suite 2025\Draw\GMS\PrimacorEmbalagens.gms" >nul
    copy /y "%SOURCE_GMS%" "%APPDATA%\Corel\CorelDRAW Graphics Suite 2024\Draw\GMS\PrimacorEmbalagens.gms" >nul
    echo [OK] Complemento copiado para os diretorios oficiais do CorelDRAW.
)

echo.
echo ================================================================
echo       INSTALACAO CONCLUIDA COM SUCESSO! (100%% AUTONOMO)        
echo ================================================================
echo.
echo Como utilizar:
echo 1. Abra o CorelDRAW.
echo 2. Va em: Ferramentas ^> Scripts ^> Gerenciador de Scripts (ou Executar Script).
echo 3. O projeto "PrimacorEmbalagens" estara pronto para uso com as opcoes:
echo    - InserirFacaTecnica (Gera a faca 1:1 solicitando as medidas)
echo    - EnviarArte3D       (Envia a arte diretamente para o 3D na nuvem)
echo    - AbrirCatalogo3D    (Abre o visualizador 3D oficial)
echo.
pause
