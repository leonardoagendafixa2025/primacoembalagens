$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $cscPath)) {
    $cscPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

$srcFiles = Get-ChildItem -Path (Join-Path $scriptDir "src\*.cs") | ForEach-Object { $_.FullName }
$iconPath = Join-Path $scriptDir "resources\primacor.ico"
$outputExe = Join-Path $scriptDir "bin\PRIMACOR-EMBALAGENS.exe"

$refCore = Join-Path $scriptDir "bin\Microsoft.Web.WebView2.Core.dll"
$refWinForms = Join-Path $scriptDir "bin\Microsoft.Web.WebView2.WinForms.dll"

Write-Host "Compilando aplicativo Windows nativo: $outputExe"

$cscArgs = @(
    "/target:winexe",
    "/platform:x64",
    "/optimize+",
    "/win32icon:$iconPath",
    "/out:$outputExe",
    "/r:System.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    "/r:$refCore",
    "/r:$refWinForms"
) + $srcFiles

& $cscPath $cscArgs

if ($LASTEXITCODE -eq 0 -and (Test-Path $outputExe)) {
    Write-Host "SUCESSO! Executável gerado:"
    Get-Item $outputExe | Select-Object Name, Length, LastWriteTime
} else {
    Write-Error "Erro na compilação do executável."
    exit 1
}
