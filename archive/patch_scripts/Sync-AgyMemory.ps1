$ErrorActionPreference = "Stop"
$env:PATH += ";C:\Users\624\tools\git\cmd"

function Invoke-GitStep {
    param(
        [string]$Description,
        [scriptblock]$Command
    )
    Write-Host "Executing: $Description..."
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed at step '$Description' with exit code: $LASTEXITCODE"
    }
}

$sourceDir = "E:\agy"
$repoPath = "E:\agymemory"

try {
    if (-not (Test-Path $repoPath)) {
        Invoke-GitStep "Clone repo" { git clone https://github.com/aiwonsi-debug/agymemory.git $repoPath }
    }

    Set-Location $repoPath

    Invoke-GitStep "Pull latest changes" { git pull origin main }

    $filesToSync = @(
        "SECRETARY_MEMORY.md",
        "secretary_memory.json",
        "bot.js",
        "webhook_server.js",
        "ops_mobile_web.html",
        "stock_inventory.json",
        "cabbage_prices_transport.json",
        "team_ops_status.json",
        "SYSTEM_REMEDIATION_REPORT.md"
    )

    $copiedAny = $false
    foreach ($f in $filesToSync) {
        $src = Join-Path $sourceDir $f
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $repoPath $f) -Force
            Invoke-GitStep "Git add $f" { git add $f }
            $copiedAny = $true
        }
    }

    if (-not $copiedAny) {
        Write-Warning "No source files found in $sourceDir to copy."
    }

    $status = git status --porcelain
    if ($status) {
        Invoke-GitStep "Git commit" { git commit -m "Robust sync: verify exit codes and remote state" }
        Invoke-GitStep "Git push origin main" { git push origin main }

        # Post-push strict remote verification
        Invoke-GitStep "Fetch remote state" { git fetch origin main }
        $localSha = (git rev-parse HEAD).Trim()
        $remoteSha = (git rev-parse origin/main).Trim()

        if ($localSha -ne $remoteSha) {
            throw "❌ Push reported success but remote SHA ($remoteSha) does not match local SHA ($localSha)!"
        }

        Write-Host "✅ Verified Push: Local SHA ($localSha) matches Remote SHA ($remoteSha)." -ForegroundColor Green
    } else {
        # Verify remote SHA matches current HEAD even if no changes to commit
        Invoke-GitStep "Fetch remote state" { git fetch origin main }
        $localSha = (git rev-parse HEAD).Trim()
        $remoteSha = (git rev-parse origin/main).Trim()

        if ($localSha -ne $remoteSha) {
            throw "❌ Local and remote SHA out of sync! Local: $localSha, Remote: $remoteSha"
        }
        Write-Host "✅ Everything up to date. Verified Local and Remote SHA: $localSha" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Sync-AgyMemory FAILED: $_" -ForegroundColor Red
    exit 1
}
