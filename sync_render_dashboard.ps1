# sync_render_dashboard.ps1 — run from project root before every deploy.
# Root files are the source of truth; render-dashboard/ is the deploy copy.
$ErrorActionPreference = "Stop"

# Format: "src" (same filename) or "src:dest" (different filename)
$files = @(
    "line_notifier.js",
    "memory_engine.js",
    "webhook_server.js:server.js",
    "cabbage_prices_transport.json",
    "stock_inventory.json",
    "team_ops_status.json",
    "secretary_memory.json",
    "public\ops.html",
    "public\js\ops.js"
)

Write-Host "== Checking for drift before sync ==" -ForegroundColor Cyan
foreach ($entry in $files) {
    if ($entry -match ":") {
        $parts = $entry -split ":"
        $src = $parts[0]
        $dest = $parts[1]
    } else {
        $src = $entry
        $dest = $entry
    }

    $rootPath = Join-Path $PSScriptRoot $src
    $renderPath = Join-Path $PSScriptRoot "render-dashboard\$dest"

    if ((Test-Path $rootPath) -and (Test-Path $renderPath)) {
        $h1 = (Get-FileHash $rootPath).Hash
        $h2 = (Get-FileHash $renderPath).Hash
        if ($h1 -ne $h2) {
            Write-Host "  DIFF: $src -> render-dashboard/$dest (render-dashboard copy will be overwritten by root copy)" -ForegroundColor Yellow
        } else {
            Write-Host "  OK: $src -> render-dashboard/$dest (identical)" -ForegroundColor Green
        }
    }
}

Write-Host "`n== Syncing root -> render-dashboard ==" -ForegroundColor Cyan
foreach ($entry in $files) {
    if ($entry -match ":") {
        $parts = $entry -split ":"
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
        Write-Host "  Synced: $src -> render-dashboard/$dest" -ForegroundColor Green
    }
}

Write-Host "`n== Done. render-dashboard/ now matches root. Ready to deploy. ==" -ForegroundColor Green
