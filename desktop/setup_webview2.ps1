$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$pkgUrl = 'https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2'
$nupkgPath = Join-Path $scriptDir 'resources\webview2.zip'
$extractPath = Join-Path $scriptDir 'resources\webview2_pkg'
$binPath = Join-Path $scriptDir 'bin'

Write-Host "Downloading Microsoft.Web.WebView2 package from $pkgUrl..."
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$webClient = New-Object System.Net.WebClient
$webClient.DownloadFile($pkgUrl, $nupkgPath)
$webClient.Dispose()

Write-Host "Extracting package..."
if (Test-Path $extractPath) { Remove-Item -Recurse -Force $extractPath }
[System.IO.Compression.ZipFile]::ExtractToDirectory($nupkgPath, $extractPath)

# Copy net462 assemblies
$libSrc = Join-Path $extractPath 'lib\net462'
if (-not (Test-Path $libSrc)) { $libSrc = Join-Path $extractPath 'lib\net45' }

Copy-Item (Join-Path $libSrc 'Microsoft.Web.WebView2.Core.dll') -Destination $binPath -Force
Copy-Item (Join-Path $libSrc 'Microsoft.Web.WebView2.WinForms.dll') -Destination $binPath -Force

# Copy native WebView2Loader.dll for runtimes (x64 and x86)
$runtimesSrc = Join-Path $extractPath 'runtimes'
if (Test-Path $runtimesSrc) {
    Copy-Item $runtimesSrc -Destination $binPath -Recurse -Force
}

# Also copy x64 WebView2Loader.dll directly into binPath for direct execution
$x64Loader = Join-Path $extractPath 'runtimes\win-x64\native\WebView2Loader.dll'
if (Test-Path $x64Loader) {
    Copy-Item $x64Loader -Destination (Join-Path $binPath 'WebView2Loader.dll') -Force
}

Remove-Item -Force $nupkgPath
Remove-Item -Recurse -Force $extractPath

Write-Host "WebView2 assemblies successfully configured in $binPath"
Get-ChildItem -Path $binPath | Select-Object Name, Length
