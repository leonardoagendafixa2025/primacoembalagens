@echo off
chcp 65001 >nul
title Instalador Oficial - Plugin PRIMACOR EMBALAGENS para CorelDRAW
color 0A

echo =====================================================================
echo    INSTALADOR OFICIAL: PRIMACOR EMBALAGENS - CORELDRAW
echo =====================================================================
echo.
echo Compatibilidade: CorelDRAW Graphics Suite 2020 ate 2025/2026.
echo Sistemas: Windows 10/11.
echo.

:: 1. Define diretorio de instalacao
set "INSTALL_DIR=%APPDATA%\PLMPackLib\CorelDRAW"

echo 1. Criando pasta de instalacao...
echo    Destino: %INSTALL_DIR%

if exist "%INSTALL_DIR%" (
    echo    Removendo versao anterior para instalacao limpa...
    rd /s /q "%INSTALL_DIR%" >nul 2>&1
)

mkdir "%INSTALL_DIR%" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    [ERRO] Falha ao criar pasta de instalacao.
    echo    Verifique permissoes do usuario.
    echo.
    pause
    exit /b 1
)

echo    [OK] Pasta criada com sucesso.
echo.

:: 2. Copia os scripts VBS para a pasta de instalacao
echo 2. Copiando scripts do plugin...

copy /Y "%~dp0AtualizarFaca.vbs" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0EnviarArte.vbs" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0Abrir3D.vbs" "%INSTALL_DIR%\" >nul
copy /Y "%~dp0PLMPackLib_Toolbar.vbs" "%INSTALL_DIR%\" >nul

echo    [OK] Scripts copiados: AtualizarFaca, EnviarArte, Abrir3D, Toolbar.
echo.

:: 3. Registra o caminho no registro do Windows para a Toolbar localizar os scripts
echo 3. Registrando caminho do plugin no registro...

reg add "HKCU\Software\PLMPackLib" /v PluginPath /t REG_SZ /d "%INSTALL_DIR%" /f >nul 2>&1

echo    [OK] Chave de registro criada em HKCU\Software\PLMPackLib.
echo.

:: 4. Cria atalhos na Area de Trabalho
echo 4. Criando atalhos na Area de Trabalho...

set "DESKTOP=%USERPROFILE%\Desktop"
if not exist "%DESKTOP%" set "DESKTOP=%USERPROFILE%\Área de Trabalho"

:: Cria atalho para Atualizar Faca
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%DESKTOP%\PLMPackLib - Atualizar Faca.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%INSTALL_DIR%\AtualizarFaca.vbs\"'; $s.Description = 'PLMPackLib - Solicita geometria da faca e atualiza no CorelDRAW'; $s.IconLocation = 'shell32.dll,70'; $s.Save()" >nul 2>&1

:: Cria atalho para Enviar Arte
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%DESKTOP%\PLMPackLib - Enviar Arte.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%INSTALL_DIR%\EnviarArte.vbs\"'; $s.Description = 'PLMPackLib - Exporta arte 300DPI e envia para 3D'; $s.IconLocation = 'shell32.dll,176'; $s.Save()" >nul 2>&1

:: Cria atalho para Abrir 3D
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%DESKTOP%\PLMPackLib - Abrir 3D.lnk'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%INSTALL_DIR%\Abrir3D.vbs\"'; $s.Description = 'PLMPackLib - Abre visualizacao 3D no navegador'; $s.IconLocation = 'shell32.dll,14'; $s.Save()" >nul 2>&1

echo    [OK] 3 atalhos criados na Area de Trabalho:
echo         - PLMPackLib - Atualizar Faca
echo         - PLMPackLib - Enviar Arte
echo         - PLMPackLib - Abrir 3D
echo.

:: 5. Verifica se o CorelDRAW esta instalado
echo 5. Verificando instalacao do CorelDRAW...

set "COREL_FOUND=0"
for %%V in (20 21 22 23 24 25 26 27) do (
    if exist "C:\Program Files\Corel\CorelDRAW Graphics Suite\%%V\Programs64\CorelDRW.exe" (
        echo    [OK] CorelDRAW v%%V encontrado.
        set "COREL_FOUND=1"
    )
)

if "%COREL_FOUND%"=="0" (
    echo    [AVISO] CorelDRAW nao foi encontrado no caminho padrao.
    echo    O plugin funcionara normalmente quando o CorelDRAW for instalado.
)
echo.

:: 6. Resumo final
echo =====================================================================
echo    INSTALACAO CONCLUIDA COM SUCESSO!
echo =====================================================================
echo.
echo Como usar o plugin PLMPackLib no CorelDRAW:
echo.
echo 1. Abra o PLMPackLib Web:
echo    https://primacorembalagens.vercel.app
echo.
echo 2. Configure sua embalagem (modelo, dimensoes, etc.)
echo.
echo 3. Inicie a Bridge local (conecte pelo botao no topo do site)
echo.
echo 4. Clique no botao [Cdr CorelDRAW] para enviar a faca
echo    automaticamente ao CorelDRAW com escala 1:1 mm.
echo.
echo 5. Crie sua arte na camada PLMPACKLIB_ARTE.
echo.
echo 6. Use os atalhos da Area de Trabalho ou os scripts em:
echo    %INSTALL_DIR%
echo.
echo Funcionalidades instaladas:
echo    * Atualizar Faca - Solicita geometria atualizada da Bridge
echo    * Enviar Arte    - Exporta arte 300 DPI e envia para 3D
echo    * Abrir 3D       - Abre visualizacao 3D no navegador
echo.
echo =====================================================================
echo.
pause
