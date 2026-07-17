# WAV -> OGG 批量转换脚本
# 用法: powershell -ExecutionPolicy Bypass -File scripts\convert_audio.ps1

$ErrorActionPreference = 'Stop'
$audioDir = Join-Path $PSScriptRoot '..\public\audio'
$ffmpeg = 'E:\ffmpeg-master-latest-win64-gpl-shared\bin\ffmpeg.exe'

Write-Host "=== WAV -> OGG 批量转换 ==="
Write-Host "Audio dir: $audioDir"

# 获取所有 WAV 文件
$wavFiles = Get-ChildItem -Path $audioDir -Recurse -Filter '*.wav'
$total = $wavFiles.Count
Write-Host "Found $total WAV files"

$converted = 0
$failed = 0
$startTime = Get-Date

foreach ($wav in $wavFiles) {
    $oggPath = $wav.FullName -replace '\.wav$', '.ogg'
    
    # 跳过已存在的 OGG 文件
    if (Test-Path $oggPath) {
        $converted++
        continue
    }
    
    # 转换: 32kbps 单声道 OGG Vorbis
    $result = & $ffmpeg -i $wav.FullName -c:a libvorbis -b:a 32k -ac 1 -y -loglevel error $oggPath 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        # 删除原始 WAV 文件
        Remove-Item $wav.FullName -Force
        $converted++
    } else {
        $failed++
        Write-Host "FAILED: $($wav.FullName) - $result"
    }
    
    # 每 500 个文件打印进度
    if ($converted % 500 -eq 0 -and $converted -gt 0) {
        $elapsed = (Get-Date) - $startTime
        $rate = $converted / $elapsed.TotalSeconds
        $remaining = ($total - $converted) / $rate
        Write-Host "Progress: $converted / $total ($([math]::Round($converted/$total*100, 1))%) - Rate: $([math]::Round($rate, 1))/s - ETA: $([math]::Round($remaining/60, 1)) min"
    }
}

$elapsed = (Get-Date) - $startTime
Write-Host ""
Write-Host "=== 转换完成 ==="
Write-Host "Total: $total, Converted: $converted, Failed: $failed"
Write-Host "Time: $([math]::Round($elapsed.TotalMinutes, 1)) min"

# 更新 manifest.json 中的 .wav -> .ogg
$manifestPath = Join-Path $audioDir 'manifest.json'
if (Test-Path $manifestPath) {
    Write-Host ""
    Write-Host "Updating manifest.json..."
    $content = Get-Content $manifestPath -Raw
    $updated = $content -replace '\.wav"', '.ogg"'
    Set-Content $manifestPath -Value $updated -Encoding UTF8
    Write-Host "manifest.json updated (.wav -> .ogg)"
}

# 检查结果
$oggFiles = Get-ChildItem -Path $audioDir -Recurse -Filter '*.ogg'
$wavRemaining = (Get-ChildItem -Path $audioDir -Recurse -Filter '*.wav' -ErrorAction SilentlyContinue).Count
$totalSize = (Get-ChildItem -Path $audioDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Write-Host "OGG files: $($oggFiles.Count)"
Write-Host "WAV remaining: $wavRemaining"
Write-Host "Total audio size: $([math]::Round($totalSize/1MB, 2)) MB"
