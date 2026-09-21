import type { PLMPackProjectExchange } from '../illustrator/projectExchange';

/**
 * Compilador de automação profissional para CorelDRAW (CorelDRAW Graphics Suite 2024 / 2025 / v26+)
 * Gera scripts de automação métrica 1:1, camadas técnicas isoladas, estilos de linha
 * profissionais para facaria (Corte e Vinco) e metadados de painéis para mapeamento 3D.
 */
function utf8ToBase64(str: string): string {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  }));
}

export function generateCorelAutomationScript(project: PLMPackProjectExchange): string {
  const jsonPayload = JSON.stringify(project);
  const base64Json = utf8ToBase64(jsonPayload);

  return `# PLMPackLib Oficial Bridge Script para CorelDRAW
# Gerado automaticamente pelo motor CAD PLMPackLib
# Projeto: ${project.projectId} (${project.modelCode} - ${project.projectName})

$ErrorActionPreference = "Stop"

try {
  $b64 = "${base64Json}"
  $rawJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
  $projectData = $rawJson | ConvertFrom-Json

  $MARGIN_MM = 15.0 # Margem de respiro idêntica ao Illustrator (15 mm)

  $bounds = $projectData.dieline.bounds
  $dielineWidthMm = [double]$bounds.width
  $dielineHeightMm = [double]$bounds.height

  $artboardWidthMm = $dielineWidthMm + ($MARGIN_MM * 2.0)
  $artboardHeightMm = $dielineHeightMm + ($MARGIN_MM * 2.0)

  # Conexão COM com CorelDRAW
  $app = $null
  try {
    $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application.26")
  } catch {
    try {
      $app = [System.Runtime.InteropServices.Marshal]::GetActiveObject("CorelDRAW.Application")
    } catch {
      try {
        $app = New-Object -ComObject "CorelDRAW.Application.26"
      } catch {
        $app = New-Object -ComObject "CorelDRAW.Application"
      }
    }
  }

  if ($null -eq $app) {
    throw "Não foi possível conectar ao CorelDRAW. Certifique-se de que o software está instalado."
  }

  $app.Visible = $true

  # 1. Obter documento existente ou criar novo
  $doc = $null
  $isUpdate = $false

  if ($null -ne $app.Documents) {
    foreach ($d in $app.Documents) {
      if ($d.Name -like "*$($projectData.projectId)*") {
        $doc = $d
        $isUpdate = $true
        break
      }
    }
  }

  if ($null -eq $doc) {
    $doc = $app.CreateDocument()
    try {
      $doc.Name = "$($projectData.modelCode)_$($projectData.projectId)"
    } catch {}
  }

  # Define unidade milímetros (4 = cdrMillimeter)
  $doc.Unit = 4
  $page = $doc.ActivePage
  $page.SetSize($artboardWidthMm, $artboardHeightMm)

  # No CorelDRAW, a origem central padrão é (0,0) ou relativa à página
  # Calculamos coordenadas absolutas centralizadas no artboard em mm
  $leftMm = -($artboardWidthMm / 2.0)
  $bottomMm = -($artboardHeightMm / 2.0)
  $originXMm = $MARGIN_MM - [double]$bounds.minX
  $originYMm = $MARGIN_MM - [double]$bounds.minY

  function ToCorelX([double]$xMm) {
    return $leftMm + ($xMm + $originXMm)
  }

  function ToCorelY([double]$yMm) {
    return $bottomMm + ($yMm + $originYMm)
  }

  # 2. Gerenciamento de Camadas Oficiais (Mesma Estrutura do Illustrator)
  function GetOrCreateLayer($layerName) {
    $found = $null
    foreach ($l in $page.Layers) {
      if ($l.Name -eq $layerName) {
        $found = $l
        break
      }
    }
    if ($null -eq $found) {
      $found = $page.CreateLayer($layerName)
    }
    return $found
  }

  $layerArte = GetOrCreateLayer("PLMPACKLIB_ARTE")
  $layerArte.Editable = $true
  $layerArte.Printable = $true
  $layerArte.Visible = $true

  $layerCorte = GetOrCreateLayer("PLMPACKLIB_CORTE")
  $layerVinco = GetOrCreateLayer("PLMPACKLIB_VINCO")
  $layerPaineis = GetOrCreateLayer("PLMPACKLIB_PAINEIS")
  $layerCotas = GetOrCreateLayer("PLMPACKLIB_COTAS")
  $layerRef = GetOrCreateLayer("PLMPACKLIB_REFERENCIA")

  # Limpa apenas as camadas técnicas ao sincronizar (NUNCA a camada de arte!)
  $layersToClean = @($layerCorte, $layerVinco, $layerPaineis, $layerCotas, $layerRef)
  foreach ($l in $layersToClean) {
    try {
      $l.Editable = $true
      while ($l.Shapes.Count -gt 0) {
        $l.Shapes.Item(1).Delete()
      }
    } catch {}
  }

  # 3. Desenhar Linhas Vetoriais da Faca (1:1 mm)
  if ($null -ne $projectData.dieline.lines) {
    foreach ($l in $projectData.dieline.lines) {
      $p1x = ToCorelX([double]$l.x1)
      $p1y = ToCorelY([double]$l.y1)
      $p2x = ToCorelX([double]$l.x2)
      $p2y = ToCorelY([double]$l.y2)

      # Ignora linhas de comprimento zero
      if ([Math]::Abs($p1x - $p2x) -lt 0.001 -and [Math]::Abs($p1y - $p2y) -lt 0.001) {
        continue
      }

      $targetLayer = $layerCorte
      $cyan = 0; $magenta = 100; $yellow = 100; $black = 0 # Vermelho Corte
      $isDashed = $false

      if ($l.type -eq "crease") {
        $targetLayer = $layerVinco
        $cyan = 100; $magenta = 0; $yellow = 30; $black = 0 # Verde-água Vinco
        $isDashed = $true
      } elseif ($l.type -eq "dimension") {
        $targetLayer = $layerCotas
        $cyan = 0; $magenta = 40; $yellow = 100; $black = 0 # Âmbar Cotas
      } elseif ($l.type -eq "bleed") {
        $targetLayer = $layerRef
        $cyan = 80; $magenta = 0; $yellow = 80; $black = 0 # Verde Sangria
        $isDashed = $true
      }

      try {
        $lineSeg = $targetLayer.CreateLineSegment($p1x, $p1y, $p2x, $p2y)
        $lineSeg.Outline.Width = 0.5 # 0.5 mm
        $lineSeg.Outline.Color.CMYKAssign($cyan, $magenta, $yellow, $black)
        if ($isDashed) {
          try {
            $lineSeg.Outline.Style = $doc.OutlineStyles(2)
          } catch {}
        }
      } catch {}
    }
  }

  # 4. Desenhar Arcos Vetoriais (1:1 mm)
  if ($null -ne $projectData.dieline.arcs) {
    foreach ($arc in $projectData.dieline.arcs) {
      $r = [double]$arc.r
      if ($r -le 0.001) { continue }
      $cx = ToCorelX([double]$arc.cx)
      $cy = ToCorelY([double]$arc.cy)

      $targetLayer = if ($arc.type -eq "crease") { $layerVinco } else { $layerCorte }
      $cyan = if ($arc.type -eq "crease") { 100 } else { 0 }
      $magenta = if ($arc.type -eq "crease") { 0 } else { 100 }
      $yellow = if ($arc.type -eq "crease") { 30 } else { 100 }
      $black = 0
      $isDashed = ($arc.type -eq "crease")

      $startRad = ([double]$arc.startAngle * [Math]::PI) / 180.0
      $endRad = ([double]$arc.endAngle * [Math]::PI) / 180.0
      $stepCount = [Math]::Max(8, [Math]::Round([Math]::Abs([double]$arc.endAngle - [double]$arc.startAngle) / 10.0))

      $arcPts = @()
      for ($s = 0; $s -le $stepCount; $s++) {
        $curAngle = $startRad + ($s / $stepCount) * ($endRad - $startRad)
        $arcPts += [PSCustomObject]@{
          x = $cx + [Math]::Cos($curAngle) * $r
          y = $cy + [Math]::Sin($curAngle) * $r
        }
      }

      if ($arcPts.Count -ge 2) {
        try {
          $crv = $app.CreateCurve($doc)
          $sp = $crv.CreateSubPath($arcPts[0].x, $arcPts[0].y)
          for ($si = 1; $si -lt $arcPts.Count; $si++) {
            [void]$sp.AppendLineSegment($arcPts[$si].x, $arcPts[$si].y)
          }
          $shape = $targetLayer.CreateCurve($crv)
          $shape.Outline.Width = 0.5
          $shape.Outline.Color.CMYKAssign($cyan, $magenta, $yellow, $black)
          if ($isDashed) {
            try { $shape.Outline.Style = $doc.OutlineStyles(2) } catch {}
          }
        } catch {}
      }
    }
  }

  # 5. Desenhar Polígonos de Painéis com Metadados (Para Mapeamento 3D)
  if ($null -ne $projectData.panels) {
    foreach ($panel in $projectData.panels) {
      if ($null -eq $panel.polygon -or $panel.polygon.Count -lt 3) { continue }

      $polyPts = @()
      foreach ($pt in $panel.polygon) {
        $polyPts += [PSCustomObject]@{
          x = ToCorelX([double]$pt.x)
          y = ToCorelY([double]$pt.y)
        }
      }

      try {
        $crv = $app.CreateCurve($doc)
        $sp = $crv.CreateSubPath($polyPts[0].x, $polyPts[0].y)
        for ($pi = 1; $pi -lt $polyPts.Count; $pi++) {
          [void]$sp.AppendLineSegment($polyPts[$pi].x, $polyPts[$pi].y)
        }
        $sp.Closed = $true
        $shape = $layerPaineis.CreateCurve($crv)
        $shape.Outline.Width = 0.25
        $shape.Outline.Color.CMYKAssign(0, 40, 100, 0)
        try { $shape.Outline.Style = $doc.OutlineStyles(2) } catch {}
        $shape.Name = "PLMPACK_PANEL:" + $panel.id + ":" + $panel.name
      } catch {}
    }
  }

  # 6. Segurança e Ativação da Camada de Arte
  try { $layerCorte.Editable = $false } catch {}
  try { $layerVinco.Editable = $false } catch {}
  try { $layerPaineis.Editable = $false } catch {}
  try { $layerCotas.Editable = $false } catch {}
  try { $layerRef.Editable = $false } catch {}

  try {
    $layerArte.Editable = $true
    $layerArte.Activate()
  } catch {}

  try {
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate("CorelDRAW")
  } catch {}

  $res = @{
    success = $true
    documentName = $doc.Name
    artboardWidthMm = $artboardWidthMm
    artboardHeightMm = $artboardHeightMm
    isUpdate = $isUpdate
    projectId = $projectData.projectId
    geometryVersion = $projectData.geometryVersion
  }
  Write-Output ($res | ConvertTo-Json -Compress)
} catch {
  $errRes = @{
    success = $false
    error = $_.Exception.ToString()
  }
  Write-Output ($errRes | ConvertTo-Json -Compress)
}
`;
}

/**
 * Compila o script de exportação de arte em 300 DPI a partir do CorelDRAW ativo.
 * Oculta temporariamente todas as camadas técnicas para extrair exclusivamente a arte gráfica.
 */
export function generateCorelArtworkExportScript(outputPath: string): string {
  const cleanOutputPath = outputPath.replace(/'/g, "''");

  return `# PLMPackLib Script de Exportação de Arte do CorelDRAW (300 DPI)
$ErrorActionPreference = "Stop"

try {
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

  if ($null -eq $app -or $null -eq $app.ActiveDocument) {
    throw "Nenhum documento ativo no CorelDRAW."
  }

  $doc = $app.ActiveDocument
  $page = $doc.ActivePage

  $layerArte = $null
  foreach ($l in $page.Layers) {
    if ($l.Name -eq "PLMPACKLIB_ARTE") {
      $layerArte = $l
      break
    }
  }

  if ($null -eq $layerArte) {
    throw "Camada PLMPACKLIB_ARTE não encontrada no documento ativo do CorelDRAW."
  }

  # Salva visibilidade original das camadas e oculta as camadas técnicas
  $originalVisibility = @{}
  foreach ($l in $page.Layers) {
    $originalVisibility[$l.Name] = $l.Visible
    if ($l.Name -ne "PLMPACKLIB_ARTE") {
      $l.Visible = $false
    } else {
      $l.Visible = $true
    }
  }

  # Configurações de exportação profissional: 300 DPI, RGB, Anti-Aliasing ativo
  $expOptions = $app.CreateStructExportOptions()
  $expOptions.ResolutionX = 300
  $expOptions.ResolutionY = 300
  $expOptions.ImageType = 2 # cdrRGBColorImage
  $expOptions.AntiAliasingType = 1 # cdrNormalAntiAliasing

  $palOptions = $app.CreateStructPaletteOptions()

  $outPath = '${cleanOutputPath}'
  if (Test-Path $outPath) {
    Remove-Item $outPath -Force
  }

  # ExportFilter: 1284 = cdrPNG, 0 = cdrCurrentPage
  $filter = $doc.ExportEx($outPath, 1284, 0, $expOptions, $palOptions)
  $filter.Finish()

  # Restaura visibilidade original das camadas
  foreach ($l in $page.Layers) {
    if ($originalVisibility.ContainsKey($l.Name)) {
      $l.Visible = $originalVisibility[$l.Name]
    }
  }

  $res = @{
    success = $true
    exportedPath = $outPath
    documentName = $doc.Name
  }
  Write-Output ($res | ConvertTo-Json -Compress)
} catch {
  $errRes = @{
    success = $false
    error = $_.Exception.ToString()
  }
  Write-Output ($errRes | ConvertTo-Json -Compress)
}
`;
}
