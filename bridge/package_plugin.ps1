$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$staging = Join-Path $env:TEMP ("primacor_corel_pack_" + [System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $staging -Force | Out-Null

Copy-Item (Join-Path $scriptDir "PrimacorEmbalagens.bas") -Destination (Join-Path $staging "PrimacorEmbalagens.bas")
if (Test-Path (Join-Path $scriptDir "PrimacorEmbalagens.gms")) {
    Copy-Item (Join-Path $scriptDir "PrimacorEmbalagens.gms") -Destination (Join-Path $staging "PrimacorEmbalagens.gms")
}
Copy-Item (Join-Path $scriptDir "Instalar_Plugin_CorelDRAW.bat") -Destination (Join-Path $staging "Instalar_Plugin_CorelDRAW.bat")
Copy-Item (Join-Path $scriptDir "COMO_INSTALAR_CORELDRAW.txt") -Destination (Join-Path $staging "COMO_INSTALAR_CORELDRAW.txt")

$zipDest = Join-Path $rootDir "web\public\downloads\Plugin_CorelDRAW_Primacor.zip"
if (Test-Path $zipDest) { Remove-Item -Force $zipDest }

[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $zipDest)
Remove-Item -Recurse -Force $staging

Write-Host "ZIP criado com sucesso em: $zipDest"
Get-Item $zipDest | Select-Object Name, Length, LastWriteTime
