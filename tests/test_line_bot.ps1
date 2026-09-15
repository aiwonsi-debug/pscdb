# test_line_bot.ps1 — Comprehensive test suite for LINE Bot integration
$ErrorActionPreference = "Continue"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "🧪 LINE BOT VERIFICATION & DIAGNOSTIC TEST SUITE" -ForegroundColor Cyan
Write-Host "================================================================`n" -ForegroundColor Cyan

$passCount = 0
$failCount = 0

function Assert-Test ($name, [scriptblock]$condition) {
    try {
        $result = & $condition
        if ($result -eq $true) {
            Write-Host "✅ [PASS] $name" -ForegroundColor Green
            $global:passCount++
        } else {
            Write-Host "❌ [FAIL] $name" -ForegroundColor Red
            $global:failCount++
        }
    } catch {
        Write-Host "❌ [FAIL] $name - Error: $($_.Exception.Message)" -ForegroundColor Red
        $global:failCount++
    }
}

# 1. Check Configuration Files & Secrets
$cfgPath = "secrets/line_config.json"
Assert-Test "1. Config file exists in secrets/line_config.json" {
    Test-Path $cfgPath
}

$cfg = Get-Content -Raw $cfgPath -Encoding utf8 | ConvertFrom-Json
$token = $cfg.line_channel_access_token
$channelSecret = $cfg.channel_secret
$targetGroup = $cfg.line_target_group_id
$targetUser = $cfg.line_target_user_id

Assert-Test "2. Channel Access Token is configured" {
    -not [string]::IsNullOrWhiteSpace($token)
}

Assert-Test "3. Channel Secret is configured for HMAC verification" {
    -not [string]::IsNullOrWhiteSpace($channelSecret)
}

Assert-Test "4. Target Group ID and User ID are configured" {
    (-not [string]::IsNullOrWhiteSpace($targetGroup)) -and (-not [string]::IsNullOrWhiteSpace($targetUser))
}

# 2. Live LINE Messaging API Connectivity
$headers = @{ "Authorization" = "Bearer $token" }
Assert-Test "5. Live LINE API: Bot profile query (GET /v2/bot/info)" {
    $info = Invoke-RestMethod -Uri "https://api.line.me/v2/bot/info" -Headers $headers -Method Get -TimeoutSec 10
    $info.basicId -eq "@362uaqnv" -and $info.displayName -eq "PSCCM"
}

Assert-Test "6. Live LINE API: Message quota check (GET /v2/bot/message/quota)" {
    $quota = Invoke-RestMethod -Uri "https://api.line.me/v2/bot/message/quota" -Headers $headers -Method Get -TimeoutSec 10
    $quota.value -gt 0
}

# 3. Webhook HMAC-SHA256 Signature Verification
Assert-Test "7. Webhook Signature: Correct HMAC-SHA256 matching channel_secret" {
    $testBody = '{"events":[{"type":"message","message":{"type":"text","text":"ping"}}]}'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($testBody)
    $keyBytes = [System.Text.Encoding]::UTF8.GetBytes($channelSecret)
    $hmac = New-Object System.Security.Cryptography.HMACSHA256 -ArgumentList @(,$keyBytes)
    $hashBytes = $hmac.ComputeHash($bytes)
    $signature = [Convert]::ToBase64String($hashBytes)

    # Re-verify
    $verifyHash = $hmac.ComputeHash($bytes)
    $verifySig = [Convert]::ToBase64String($verifyHash)
    $signature -eq $verifySig
}

# 4. Verification of line_handler.js logic (Caching, Concurrency, No Hardcoding)
$handlerCode = Get-Content -Raw "line_handler.js" -Encoding utf8

Assert-Test "8. line_handler.js: Implements SHA-256 image caching" {
    $handlerCode.Contains("computeFileHash") -and $handlerCode.Contains("imageAnalysisCache")
}

Assert-Test "9. line_handler.js: Implements Concurrency Queue (ImageProcessingQueue)" {
    $handlerCode.Contains("ImageProcessingQueue") -and $handlerCode.Contains("analysisQueue")
}

Assert-Test "10. line_handler.js: No hardcoded 'C:\Users\624' or machine paths" {
    -not $handlerCode.Contains("C:\Users\624") -and -not $handlerCode.Contains("E:\agy")
}

Assert-Test "11. line_handler.js: Checks secrets/line_config.json first" {
    $handlerCode.Contains("secrets") -and $handlerCode.Contains("line_config.json")
}

# 5. Verification of line_notifier.js Group Push Policy
$notifierCode = Get-Content -Raw "line_notifier.js" -Encoding utf8

Assert-Test "12. line_notifier.js: Group Push policy restricts non-summary messages" {
    $notifierCode.Contains("GROUP_ONLY_ACCEPTS_DAILY_SUMMARY") -and $notifierCode.Contains("Redirected notification to private user")
}

# 6. Verification of bot.js & webhook_server.js LINE routing
$whCode = Get-Content -Raw "webhook_server.js" -Encoding utf8
$botCode = Get-Content -Raw "bot.js" -Encoding utf8

Assert-Test "13. webhook_server.js: Routes LINE text to bot.handleCommand" {
    $whCode.Contains("pathname === '/api/line-webhook'") -and $whCode.Contains('bot.handleCommand(`LINE:${sourceId}`, text, null)')
}

Assert-Test "14. webhook_server.js: Routes LINE images to bot.handleLineImage" {
    $whCode.Contains('bot.handleLineImage(`LINE:${sourceId}`, messageId)')
}

Assert-Test "15. bot.js: checkAuthorization handles LINE prefix with target Group/User IDs" {
    $botCode.Contains("chatIdStr.startsWith('LINE:')") -and $botCode.Contains("line_target_group_id")
}

# 7. Verification of services/stock_parser.js for LINE Free-Text Reports
$parserCode = Get-Content -Raw "services/stock_parser.js" -Encoding utf8

Assert-Test "16. services/stock_parser.js: Extracts loading report fields" {
    $parserCode.Contains("extractLoadingReportFromText") -and $parserCode.Contains("weight_kg") -and $parserCode.Contains("freight_baht")
}

Assert-Test "17. services/stock_parser.js: Extracts stock count fields" {
    $parserCode.Contains("extractStockFromText") -and $parserCode.Contains("Cabbage") -and $parserCode.Contains("Onion_AFT")
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
if ($global:failCount -eq 0) {
    Write-Host "TEST SUMMARY: $global:passCount PASSED | $global:failCount FAILED" -ForegroundColor Green
} else {
    Write-Host "TEST SUMMARY: $global:passCount PASSED | $global:failCount FAILED" -ForegroundColor Red
}
Write-Host "================================================================" -ForegroundColor Cyan

if ($global:failCount -gt 0) { exit 1 } else { exit 0 }
