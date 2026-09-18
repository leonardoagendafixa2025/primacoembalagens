Add-Type -AssemblyName System.Drawing

$jsonPath = "C:/temp/primacor_img_tasks.json"
$tasks = Get-Content $jsonPath -Raw | ConvertFrom-Json

$localTemp = "C:\temp\engview_thumbs"
if (!(Test-Path $localTemp)) {
    New-Item -ItemType Directory -Path $localTemp -Force | Out-Null
}

$count = 0
$total = $tasks.Count
Write-Host "Iniciando conversao de $total miniaturas para $localTemp..."

foreach ($t in $tasks) {
    $fileName = [System.IO.Path]::GetFileName($t.dest)
    $tempFile = Join-Path $localTemp $fileName
    
    if (Test-Path $tempFile) {
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
        
        $bmp.Save($tempFile, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $g.Dispose()
        $bmp.Dispose()
        $orig.Dispose()
        $count++
        if ($count % 300 -eq 0) {
            Write-Host "Processadas $count de $total miniaturas..."
        }
    } catch {
        # Continua
    }
}

Write-Host "Conversao concluida! Total gerado no temp: $count miniaturas."
Write-Host "Copiando para pasta oficial web/public/thumbnails/engview/..."

$destFolder = (Resolve-Path "web\public\thumbnails\engview").Path
Copy-Item -Path "$localTemp\*" -Destination $destFolder -Force
Write-Host "Copia finalizada com sucesso para $destFolder!"
