const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const srcBase = 'C:/Users/Preimpressao-Primaco/Downloads/AyuGram Desktop/engview_library_complete (2)';

const thumbDir = path.join(repoRoot, 'web/public/thumbnails/engview');
const dielineDir = path.join(repoRoot, 'web/public/dielines/engview');
const catalogFile = path.join(repoRoot, 'web/src/engine/modelsCatalog.json');

console.log('=== IMPORTAÇÃO ENGVIEW -> PRIMACOR EMBALAGENS ===');

// 1. Cria diretórios de destino
if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
if (!fs.existsSync(dielineDir)) fs.mkdirSync(dielineDir, { recursive: true });

// 2. Carrega catálogos processados
const corrPath = path.join(srcBase, 'assets/data/catalog_corrugated_processed.json');
const fcPath = path.join(srcBase, 'assets/data/catalog_folding_carton_processed.json');

const corr = JSON.parse(fs.readFileSync(corrPath, 'utf8'));
const fc = JSON.parse(fs.readFileSync(fcPath, 'utf8'));
const allEngview = [...corr, ...fc];
console.log(`Carregados ${allEngview.length} modelos do EngView (${corr.length} Ondulado, ${fc.length} Cartão).`);

function cleanId(rawCode, dbId) {
  let id = rawCode.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `ev_${id}_${dbId}`;
}

function determineCategoryAndSeries(item) {
  const code = item.code.toUpperCase();
  
  if (code.startsWith('FEFCO') || /^\d{4}/.test(code)) {
    const num = code.replace(/\D/g, '').slice(0, 4);
    const sGroup = num ? num.slice(0, 2) + '00' : '0200';
    return {
      category: 'FEFCO',
      series: `Série ${sGroup} - FEFCO Ondulado`
    };
  }
  
  if (code.startsWith('EVC')) {
    return {
      category: 'FEFCO',
      series: 'EngView Corrugated (Papelão Ondulado)'
    };
  }
  
  if (/^[A-FX]\d/.test(code) || code.startsWith('ECMA')) {
    const letter = code.charAt(0);
    return {
      category: 'ECMA',
      series: `ECMA Família ${letter} - Cartão Dobrável`
    };
  }
  
  if (code.startsWith('EVF')) {
    return {
      category: 'ECMA',
      series: 'EngView Folding Carton (Cartuchos Especiais)'
    };
  }
  
  return {
    category: 'ECMA',
    series: 'Geral - Cartão / Papelão'
  };
}

// 3. Prepara lista de cópia de SVGs e conversão de Imagens
const svgCopyList = [];
const imgConvertList = [];
const newCatalogEntries = [];

for (const item of allEngview) {
  const id = cleanId(item.code, item.dbId);
  const { category, series } = determineCategoryAndSeries(item);
  
  // SVG
  if (item.svgFile) {
    const srcSvg = path.join(srcBase, item.svgFile);
    const destSvg = path.join(dielineDir, `${id}.svg`);
    if (fs.existsSync(srcSvg)) {
      svgCopyList.push({ src: srcSvg, dest: destSvg });
    }
  }
  
  // Imagem
  let thumbRel = null;
  if (item.pngFile) {
    const srcPng = path.join(srcBase, item.pngFile);
    const destJpg = path.join(thumbDir, `${id}.jpg`);
    if (fs.existsSync(srcPng)) {
      imgConvertList.push({ src: srcPng, dest: destJpg });
      thumbRel = `/thumbnails/engview/${id}.jpg`;
    }
  }

  newCatalogEntries.push({
    id: id,
    rawName: item.code,
    code: item.code,
    name: item.name || item.code,
    category: category,
    series: series,
    description: `${item.name || item.code} (${category}) - Espessura: ${item.thickness || 1}mm - Material: ${item.material || 'Padrão'}`,
    thumbnail: thumbRel,
    svgDieline: `/dielines/engview/${id}.svg`,
    source: 'ENGVIEW_PARAMETRIC',
    defaultParams: {
      L: 300,
      B: 200,
      H: 150,
      Ep: item.thickness || 1.5
    }
  });
}

console.log(`SVGs prontos para copiar: ${svgCopyList.length}`);
console.log(`Miniaturas prontas para otimizar: ${imgConvertList.length}`);

// 4. Copia os SVGs
console.log('Copiando SVGs para web/public/dielines/engview/...');
let copiedSvgs = 0;
for (const task of svgCopyList) {
  fs.copyFileSync(task.src, task.dest);
  copiedSvgs++;
}
console.log(`[OK] ${copiedSvgs} SVGs copiados com sucesso!`);

// 5. Gera script PowerShell para conversão em lote rápida das imagens
const psConvertScript = path.join(__dirname, 'convert_thumbs.ps1');
const listJson = path.join(__dirname, 'img_tasks.json');
fs.writeFileSync(listJson, JSON.stringify(imgConvertList), 'utf8');

const psScript = `
Add-Type -AssemblyName System.Drawing
$tasks = Get-Content '${listJson.replace(/\\/g, '/')}' | ConvertFrom-Json
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]80)

$count = 0
$total = $tasks.Count
Write-Host "Iniciando compressao de $total imagens para JPEG (320px)..."

foreach ($t in $tasks) {
    if (Test-Path $t.dest) {
        $count++
        continue
    }
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
        if ($count % 250 -eq 0) {
            Write-Host "Processadas $count de $total imagens..."
        }
    } catch {
        # Continua se alguma imagem tiver falha
    }
}
Write-Host "Concluidas $count imagens com sucesso!"
`;

fs.writeFileSync(psConvertScript, psScript, 'utf8');

console.log('Executando conversão e otimização das miniaturas 3D...');
try {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psConvertScript}"`, { stdio: 'inherit' });
} catch(e) {
  console.error('Aviso ao converter algumas imagens:', e.message);
}

// 6. Atualiza modelsCatalog.json
const currentCatalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
console.log(`Catálogo atual possuía: ${currentCatalog.length} modelos.`);

const existingIds = new Set(currentCatalog.map(c => c.id));
let added = 0;
for (const entry of newCatalogEntries) {
  if (!existingIds.has(entry.id)) {
    currentCatalog.push(entry);
    existingIds.add(entry.id);
    added++;
  }
}

fs.writeFileSync(catalogFile, JSON.stringify(currentCatalog, null, 2), 'utf8');
console.log(`[SUCESSO] Adicionados ${added} novos modelos. Total no catálogo agora: ${currentCatalog.length} modelos!`);

// Limpa arquivos auxiliares
if (fs.existsSync(listJson)) fs.unlinkSync(listJson);
if (fs.existsSync(psConvertScript)) fs.unlinkSync(psConvertScript);
