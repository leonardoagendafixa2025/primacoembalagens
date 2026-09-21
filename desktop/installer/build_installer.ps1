# desktop/installer/build_installer.ps1
# Empacota o instalador executável oficial do PRIMACOR EMBALAGENS

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $scriptDir "..\..")
$desktopDir = Join-Path $rootDir "desktop"
$binDir = Join-Path $desktopDir "bin"
$distDir = Join-Path $desktopDir "dist"
$tempDir = Join-Path $env:TEMP ("primacor_build_" + [Guid]::NewGuid().ToString("N"))

if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " CRIANDO INSTALADOR OFICIAL: PRIMACOR EMBALAGENS Setup.exe" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verificar se o binário principal existe
$mainExe = Join-Path $binDir "PRIMACOR-EMBALAGENS.exe"
if (-not (Test-Path $mainExe)) {
    Write-Host "Binário não encontrado. Compilando primeiro..." -ForegroundColor Yellow
    & (Join-Path $desktopDir "build_exe.ps1")
}

# 2. Criar estrutura de payload
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$payloadStage = Join-Path $tempDir "stage"
New-Item -ItemType Directory -Path $payloadStage -Force | Out-Null

Write-Host "Agrupando arquivos binários e dependências..." -ForegroundColor Gray
Copy-Item (Join-Path $binDir "*") -Destination $payloadStage -Recurse -Force

# Incluir ícone de recursos no payload
$resDest = Join-Path $payloadStage "resources"
if (-not (Test-Path $resDest)) { New-Item -ItemType Directory -Path $resDest -Force | Out-Null }
Copy-Item (Join-Path $desktopDir "resources\primacor.ico") -Destination (Join-Path $resDest "primacor.ico") -Force

# 3. Gerar zip do Payload
$payloadZip = Join-Path $tempDir "PrimacorPayload.zip"
if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($payloadStage, $payloadZip)

# 4. Criar versão Portable em desktop/dist/
$portableZip = Join-Path $distDir "PRIMACOR-EMBALAGENS-Portable.zip"
if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
Copy-Item $payloadZip -Destination $portableZip -Force
Write-Host "[OK] Versão Portable criada em: $portableZip" -ForegroundColor Green

# 5. Compilar o Setup.exe com o payload embutido
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$setupSource = Join-Path $desktopDir "installer\SetupProgram.cs"
$setupOutput = Join-Path $distDir "PRIMACOR EMBALAGENS Setup.exe"
$iconPath = Join-Path $desktopDir "resources\primacor.ico"

Write-Host "Compilando instalador autônomo .EXE..." -ForegroundColor Gray

$compileArgs = @(
    "/target:winexe",
    "/out:`"$setupOutput`"",
    "/win32icon:`"$iconPath`"",
    "/resource:`"$payloadZip`",PrimacorPayload.zip",
    "/r:System.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.IO.Compression.FileSystem.dll",
    "/optimize+",
    "/platform:anycpu",
    "`"$setupSource`""
)

$cmd = "& `"$cscPath`" " + ($compileArgs -join " ")
Invoke-Expression $cmd

if ($LASTEXITCODE -eq 0 -and (Test-Path $setupOutput)) {
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " SUCESSO! INSTALADOR OFICIAL GERADO COM ÊXITO!" -ForegroundColor Green
    Write-Host " Arquivo: $setupOutput" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
    Get-Item $setupOutput | Select-Object Name, Length, LastWriteTime
} else {
    Write-Error "Falha ao gerar o instalador executável."
}

# Limpar temporários
try { Remove-Item $tempDir -Recurse -Force } catch {}
