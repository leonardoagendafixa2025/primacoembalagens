Add-Type -AssemblyName System.Drawing

$sourcePng = "web/public/primacor-icon.png"
$targetIco = "desktop/resources/primacor.ico"

if (-not (Test-Path $sourcePng)) {
    Write-Error "Source icon not found: $sourcePng"
    exit 1
}

$bmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $sourcePng).Path)

# Standard icon sizes
$sizes = @(16, 32, 48, 64, 128, 256)
$images = @()

foreach ($s in $sizes) {
    $resized = New-Object System.Drawing.Bitmap($s, $s)
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($bmp, 0, 0, $s, $s)
    $g.Dispose()
    $images += $resized
}

# Write ICO file binary structure
$fs = [System.IO.File]::OpenWrite((Resolve-Path -Path 'desktop/resources' -Relative) + "/primacor.ico")
$bw = New-Object System.IO.BinaryWriter($fs)

# ICO Header
$bw.Write([UInt16]0)      # Reserved
$bw.Write([UInt16]1)      # Type 1 = ICO
$bw.Write([UInt16]$sizes.Count) # Image count

# Calculate offsets
$offset = 6 + ($sizes.Count * 16)
$pngBytesList = @()

foreach ($img in $images) {
    $ms = New-Object System.IO.MemoryStream
    $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $pngBytesList += ,$bytes
    $ms.Dispose()
}

for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $wByte = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $hByte = if ($s -ge 256) { [byte]0 } else { [byte]$s }
    $bytes = $pngBytesList[$i]

    $bw.Write([byte]$wByte)        # Width
    $bw.Write([byte]$hByte)        # Height
    $bw.Write([byte]0)             # Color palette
    $bw.Write([byte]0)             # Reserved
    $bw.Write([UInt16]1)           # Color planes
    $bw.Write([UInt16]32)          # Bits per pixel
    $bw.Write([UInt32]$bytes.Length) # Image data size
    $bw.Write([UInt32]$offset)     # Offset to image data

    $offset += $bytes.Length
}

# Write image data
foreach ($bytes in $pngBytesList) {
    $bw.Write($bytes)
}

$bw.Flush()
$bw.Close()
$fs.Close()
$bmp.Dispose()
foreach ($img in $images) { $img.Dispose() }

Write-Host "ICO gerado com sucesso em: $targetIco"
Get-Item $targetIco | Select-Object Name, Length, LastWriteTime
