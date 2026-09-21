/**
 * Teste de Atualização Incremental Não-Destrutiva no CorelDRAW Real
 * Verifica se a camada PLMPACKLIB_ARTE é preservada quando novas dimensões são enviadas
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { generateCorelAutomationScript, generateCorelArtworkExportScript } = require('../web/src/integrations/coreldraw/corelGenerator.cjs');

const tempDir = path.join(os.tmpdir(), 'plmpack_bridge_nondestructive');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

async function runTest() {
  console.log('========================================================================');
  console.log(' TESTE DE ATUALIZAÇÃO NÃO-DESTRUTIVA: PRESERVAÇÃO DE ARTE NO CORELDRAW');
  console.log('========================================================================\n');

  const projectId = 'proj_nondestructive_test';

  // 1. Primeira Abertura (Geometria 1: 300x200x150 mm)
  const pkgV1 = {
    projectId,
    projectName: 'Caixa Teste V1',
    modelCode: '0201',
    modelName: 'FEFCO 0201',
    geometryVersion: 1,
    artVersion: 0,
    timestamp: new Date().toISOString(),
    dieline: {
      bounds: { minX: 0, minY: 0, maxX: 1041, maxY: 358, width: 1041, height: 358 },
      lines: [
        { x1: 0, y1: 0, x2: 1041, y2: 0, type: 'cut' },
        { x1: 0, y1: 0, x2: 0, y2: 358, type: 'cut' },
        { x1: 0, y1: 150, x2: 1041, y2: 150, type: 'crease' }
      ],
      arcs: []
    },
    panels: [
      { id: 'panel_front', name: 'Frente', polygon: [{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 250, y: 200 }, { x: 50, y: 200 }] }
    ]
  };

  const scriptV1 = generateCorelAutomationScript(pkgV1);
  const fileV1 = path.join(tempDir, 'open_v1.ps1');
  fs.writeFileSync(fileV1, scriptV1, 'utf-8');

  console.log('[1] Enviando Geometria V1 para o CorelDRAW...');
  const resV1 = execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${fileV1}"`, { encoding: 'utf-8' });
  console.log('    Resposta V1:', resV1.trim());

  // 2. Simula o designer desenhando arte personalizada na camada PLMPACKLIB_ARTE
  console.log('\n[2] Criando arte do designer na camada PLMPACKLIB_ARTE...');
  const addArtScript = `
    $app = $null
    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application.26")
    } catch {
      try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application")
      } catch {
        $app = New-Object -ComObject "CorelDRAW.Application.26"
      }
    }
    $doc = $app.ActiveDocument
    $page = $doc.ActivePage
    $layerArte = $null
    foreach ($l in $page.Layers) {
      if ($l.Name -eq "PLMPACKLIB_ARTE") { $layerArte = $l; break }
    }
    if ($layerArte) {
      $layerArte.Editable = $true
      # Cria retângulo azul de arte personalizada
      $rect = $layerArte.CreateRectangle(-100, 50, 100, -50)
      $rect.Fill.UniformColor.CMYKAssign(100, 40, 0, 0)
      $rect.Name = "LOGOTIPO_CLIENTE_ARTE"
      Write-Output "ARTE_CRIADA: Elemento '$($rect.Name)' adicionado na camada PLMPACKLIB_ARTE."
    }
  `;
  const fileAddArt = path.join(tempDir, 'add_art.ps1');
  fs.writeFileSync(fileAddArt, addArtScript, 'utf-8');
  const resArt = execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${fileAddArt}"`, { encoding: 'utf-8' });
  console.log('    ', resArt.trim());

  // 3. Segunda Abertura (Geometria V2 com dimensões aumentadas: 1150x420 mm)
  console.log('\n[3] Enviando Geometria V2 (Dimensões alteradas) para o mesmo projectId...');
  const pkgV2 = {
    projectId,
    projectName: 'Caixa Teste V2 Redimensionada',
    modelCode: '0201',
    modelName: 'FEFCO 0201',
    geometryVersion: 2,
    artVersion: 1,
    timestamp: new Date().toISOString(),
    dieline: {
      bounds: { minX: 0, minY: 0, maxX: 1150, maxY: 420, width: 1150, height: 420 },
      lines: [
        { x1: 0, y1: 0, x2: 1150, y2: 0, type: 'cut' },
        { x1: 0, y1: 0, x2: 0, y2: 420, type: 'cut' },
        { x1: 1150, y1: 0, x2: 1150, y2: 420, type: 'cut' },
        { x1: 0, y1: 180, x2: 1150, y2: 180, type: 'crease' }
      ],
      arcs: []
    },
    panels: [
      { id: 'panel_front', name: 'Frente Redimensionada', polygon: [{ x: 50, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 220 }, { x: 50, y: 220 }] }
    ]
  };

  const scriptV2 = generateCorelAutomationScript(pkgV2);
  const fileV2 = path.join(tempDir, 'open_v2.ps1');
  fs.writeFileSync(fileV2, scriptV2, 'utf-8');
  const resV2 = execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${fileV2}"`, { encoding: 'utf-8' });
  console.log('    Resposta V2:', resV2.trim());

  // 4. Verificação pós-atualização
  console.log('\n[4] Verificando integridade das camadas e preservação da arte...');
  const verifyScript = `
    $app = $null
    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application.26")
    } catch {
      try {
        $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application")
      } catch {
        $app = New-Object -ComObject "CorelDRAW.Application.26"
      }
    }
    $doc = $app.ActiveDocument
    $page = $doc.ActivePage
    
    $arteShapes = 0
    $arteName = ""
    foreach ($l in $page.Layers) {
      if ($l.Name -eq "PLMPACKLIB_ARTE") {
        $arteShapes = $l.Shapes.Count
        if ($arteShapes -gt 0) {
          $arteName = $l.Shapes.Item(1).Name
        }
      }
    }
    
    $res = @{
      pageWidth = $page.SizeWidth
      pageHeight = $page.SizeHeight
      arteShapesCount = $arteShapes
      arteFirstShapeName = $arteName
      isPreserved = ($arteShapes -ge 1)
    }
    Write-Output ($res | ConvertTo-Json -Compress)
  `;
  const fileVerify = path.join(tempDir, 'verify_update.ps1');
  fs.writeFileSync(fileVerify, verifyScript, 'utf-8');
  const resVerify = execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${fileVerify}"`, { encoding: 'utf-8' });
  const check = JSON.parse(resVerify.trim());

  console.log(`    Nova Largura da Página: ${check.pageWidth} mm (Esperado: 1180 mm)`);
  console.log(`    Nova Altura da Página:  ${check.pageHeight} mm (Esperado: 450 mm)`);
  console.log(`    Elementos na Camada de Arte: ${check.arteShapesCount}`);
  console.log(`    Nome do Elemento de Arte: ${check.arteFirstShapeName}`);
  console.log(`    Arte Preservada Intacta: ${check.isPreserved}`);

  // 5. Teste de Extração de Arte da V2
  console.log('\n[5] Extraindo arte 300 DPI pós-atualização...');
  const pngExportPath = path.join(tempDir, 'nondestructive_artwork_v2.png');
  const exportScript = generateCorelArtworkExportScript(pngExportPath);
  const fileExport = path.join(tempDir, 'export_v2.ps1');
  fs.writeFileSync(fileExport, exportScript, 'utf-8');
  const resExport = execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${fileExport}"`, { encoding: 'utf-8' });
  console.log('    Resposta Exportação:', resExport.trim());

  const pngExists = fs.existsSync(pngExportPath);
  const pngSize = pngExists ? fs.statSync(pngExportPath).size : 0;
  console.log(`    PNG Gerado: ${pngExists} (${pngSize} bytes)`);

  console.log('\n========================================================================');
  if (check.isPreserved && pngExists && pngSize > 0) {
    console.log(' RESULTADO: PASS - ATUALIZAÇÃO NÃO-DESTRUTIVA COMPROVADA COM SUCESSO!');
    console.log('========================================================================\n');
    process.exit(0);
  } else {
    console.log(' RESULTADO: FAIL - Falha na preservação da arte.');
    console.log('========================================================================\n');
    process.exit(1);
  }
}

runTest();
