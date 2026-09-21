$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$extSrc = Join-Path $repoRoot "extensions\com.primacor.coreldraw"
$distDir = Join-Path $repoRoot "dist_plugin_corel"
$packageDir = Join-Path $distDir "Plugin_CorelDRAW_Primacor"
$targetZip = Join-Path $repoRoot "web\public\downloads\Plugin_CorelDRAW_Primacor.zip"
$downloadsDir = Join-Path $repoRoot "web\public\downloads"

Write-Host "============================================================="
Write-Host " Gerador de Pacote: Plugin PRIMACOR EMBALAGENS para CorelDRAW"
Write-Host "============================================================="
Write-Host ""

Write-Host "1. Preparando pastas de distribuição..."
if (Test-Path $distDir) {
    Remove-Item $distDir -Recurse -Force
}
New-Item -ItemType Directory -Path $packageDir -Force | Out-Null
New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null

Write-Host "2. Copiando arquivos do plugin..."

$filesToCopy = @(
    "AtualizarFaca.vbs",
    "EnviarArte.vbs",
    "Abrir3D.vbs",
    "PLMPackLib_Toolbar.vbs",
    "Instalar_Plugin_CorelDRAW.bat",
    "COMO_INSTALAR_CORELDRAW.txt"
)

foreach ($f in $filesToCopy) {
    $src = Join-Path $extSrc $f
    if (Test-Path $src) {
        Copy-Item $src -Destination $packageDir -Force
        Write-Host "   [OK] $f"
    } else {
        Write-Warning "   [AVISO] Arquivo não encontrado: $f"
    }
}

Write-Host ""
Write-Host "3. Gerando arquivo compactado ZIP..."
if (Test-Path $targetZip) {
    Remove-Item $targetZip -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($packageDir, $targetZip)

$zipSize = (Get-Item $targetZip).Length / 1KB
Write-Host ""
Write-Host "[SUCESSO] ZIP criado em:"
Write-Host "  $targetZip"
Write-Host "  Tamanho: $($zipSize.ToString('F1')) KB"
Write-Host ""

# 4. Limpa diretório temporário de distribuição
Remove-Item $distDir -Recurse -Force
Write-Host "4. Pasta temporária de distribuição removida."
Write-Host ""
Write-Host "============================================================="
Write-Host " Pacote pronto para download em:"
Write-Host " /downloads/Plugin_CorelDRAW_Primacor.zip"
Write-Host "============================================================="
