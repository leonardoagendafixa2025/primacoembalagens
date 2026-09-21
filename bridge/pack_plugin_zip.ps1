$staging = Join-Path $env:TEMP ("primacor_corel_pack_" + [System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Copy-Item "bridge/PrimacorEmbalagens.gms" -Destination (Join-Path $staging "PrimacorEmbalagens.gms")
Copy-Item "bridge/Instalar_Plugin_CorelDRAW.bat" -Destination (Join-Path $staging "Instalar_Plugin_CorelDRAW.bat")

$txt = "=================================================================`r`n" +
       "          PRIMACOR EMBALAGENS - PLUGIN PARA CORELDRAW           `r`n" +
       "=================================================================`r`n`r`n" +
       "COMO INSTALAR:`r`n" +
       "1. De 2 cliques no arquivo 'Instalar_Plugin_CorelDRAW.bat'.`r`n" +
       "2. O plugin PRIMACOR EMBALAGENS sera instalado automaticamente no seu CorelDRAW.`r`n" +
       "3. Abra o CorelDRAW e use a integracao normalmente!`r`n"

Set-Content -Path (Join-Path $staging "COMO_INSTALAR_CORELDRAW.txt") -Value $txt -Encoding UTF8

$destZip = "web/public/downloads/Plugin_CorelDRAW_Primacor.zip"
$destDir = Split-Path $destZip -Parent
if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
if (Test-Path $destZip) { Remove-Item $destZip -Force }

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $destZip -Force
Remove-Item $staging -Recurse -Force
Write-Host "ZIP criado com sucesso em $destZip"
