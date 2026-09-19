# Check or explicitly synchronize the Render deployment copy.
# Usage:
#   .\sync_render_dashboard.ps1          # check only; fails on drift
#   .\sync_render_dashboard.ps1 -Apply   # copy root canonical files to Render
[CmdletBinding()]
param([switch]$Apply)
$ErrorActionPreference = "Stop"

$files = @(
    "public/ops.html:public/ops.html",
)

$hasDrift = $false
foreach ($entry in $files) {
    if ($entry -match ":") {
        $parts = $entry -split ":", 2
        $src = $parts[0]
        $dest = $parts[1]
    } else {
        $src = $entry
        $dest = $entry
    }
    $rootPath = Join-Path $PSScriptRoot $src
    $renderPath = Join-Path $PSScriptRoot "render-dashboard\$dest"
    if (!(Test-Path $rootPath) -or !(Test-Path $renderPath)) {
        Write-Host "MISSING: $src or render-dashboard/$dest" -ForegroundColor Red
        $hasDrift = $true
    } elseif ((Get-FileHash $rootPath).Hash -ne (Get-FileHash $renderPath).Hash) {
        Write-Host "DIFF: $src -> render-dashboard/$dest" -ForegroundColor Yellow
        $hasDrift = $true
    } else {
        Write-Host "OK:   $src -> render-dashboard/$dest" -ForegroundColor Green
    }
}

if ($hasDrift -and !$Apply) {
    Write-Host "`nDrift detected. Review the diff, then rerun with -Apply only if root is canonical." -ForegroundColor Yellow
    exit 1
}

if ($Apply) {
    foreach ($entry in $files) {
        if ($entry -match ":") {
            $parts = $entry -split ":", 2
            $src = $parts[0]
            $dest = $parts[1]
        } else {
            $src = $entry
            $dest = $entry
        }
        $rootPath = Join-Path $PSScriptRoot $src
        $renderPath = Join-Path $PSScriptRoot "render-dashboard\$dest"
        if (Test-Path $rootPath) {
            Copy-Item -Path $rootPath -Destination $renderPath -Force
            Write-Host "SYNCED: $src -> render-dashboard/$dest" -ForegroundColor Green
        }
    }
}
