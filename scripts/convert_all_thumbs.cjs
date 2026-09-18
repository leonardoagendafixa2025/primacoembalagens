const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const srcBase = 'C:/Users/Preimpressao-Primaco/Downloads/AyuGram Desktop/engview_library_complete (2)';

const thumbDir = path.join(repoRoot, 'web/public/thumbnails/engview');
const corrPath = path.join(srcBase, 'assets/data/catalog_corrugated_processed.json');
const fcPath = path.join(srcBase, 'assets/data/catalog_folding_carton_processed.json');

const corr = JSON.parse(fs.readFileSync(corrPath, 'utf8'));
const fc = JSON.parse(fs.readFileSync(fcPath, 'utf8'));
const allEngview = [...corr, ...fc];

function cleanId(rawCode, dbId) {
  let id = rawCode.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `ev_${id}_${dbId}`;
}

const tasks = [];
for (const item of allEngview) {
  if (item.pngFile) {
    const id = cleanId(item.code, item.dbId);
    const srcPng = path.join(srcBase, item.pngFile);
    const destJpg = path.join(thumbDir, `${id}.jpg`);
    if (fs.existsSync(srcPng) && !fs.existsSync(destJpg)) {
      tasks.push({ src: srcPng, dest: destJpg });
    }
  }
}

console.log(`Tarefas de conversão restantes: ${tasks.length}`);

// Grava tarefas em C:/temp/img_tasks.json para evitar caracteres especiais no caminho do OneDrive
const tmpDir = 'C:/temp';
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const tmpTasksFile = 'C:/temp/primacor_img_tasks.json';
fs.writeFileSync(tmpTasksFile, JSON.stringify(tasks), 'utf8');

const psScript = `
Add-Type -AssemblyName System.Drawing
$tasks = Get-Content 'C:/temp/primacor_img_tasks.json' | ConvertFrom-Json
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]80)

$count = 0
$total = $tasks.Count
Write-Host "Iniciando processamento de $total miniaturas..."

foreach ($t in $tasks) {
    try {
        $orig = [System.Drawing.Image]::FromFile($t.src)
        $targetW = 320
        $targetH = [int]($orig.Height * ($targetW / [Math]::Max(1, $orig.Width)))
        if ($targetH -le 0) { $targetH = 240 }
        $bmp = New-Object System.Drawing.Bitmap($targetW, $targetH)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.Clear([System.Drawing.Color]::White)
        $g.DrawImage($orig, 0, 0, $targetW, $targetH)
        
        $bmp.Save($t.dest, $codec, $encoderParams)
        $g.Dispose()
        $bmp.Dispose()
        $orig.Dispose()
        $count++
        if ($count % 300 -eq 0) {
            Write-Host "Processadas $count de $total miniaturas..."
        }
    } catch {
        # Ignora arquivos corrompidos
    }
}
Write-Host "Concluido com sucesso! Total geradas: $count miniaturas."
`;

const psScriptFile = 'C:/temp/run_convert.ps1';
fs.writeFileSync(psScriptFile, psScript, 'utf8');

console.log('Disparando PowerShell para conversão ultra-rápida...');
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psScriptFile}"`, { stdio: 'inherit' });

console.log('[SUCESSO] Todas as miniaturas foram geradas em web/public/thumbnails/engview/ !');
