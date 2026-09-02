<#
.SYNOPSIS
    Multi-Customer Automated GT Preparation & Advance Reminder (Strict Once-Per-Day Lock)
#>
param (
    [string]$BaseWorkDir = "E:\รวมงาน\งาน 25-26",
    [string]$AgyBaseDir = "E:\agy",
    [int]$DaysInAdvance = 2
)

$tgConfigPath = Join-Path $AgyBaseDir "telegram_config.json"
$notifiedHistoryPath = Join-Path $AgyBaseDir "notified_gt_deliveries.json"

function Send-TGAlert {
    param ([string]$botToken, [string]$chatId, [string]$message)
    try {
        $body = @{ chat_id = $chatId; text = $message } | ConvertTo-Json -Compress
        $headers = @{ "Content-Type" = "application/json; charset=utf-8" }
        $url = "https://api.telegram.org/bot$botToken/sendMessage"
        Invoke-RestMethod -Uri $url -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -Headers $headers -TimeoutSec 15 | Out-Null
        Write-Output "Telegram GT alert sent successfully."
    } catch {}
}

# Load Notification History
$notified = @{}
if (Test-Path $notifiedHistoryPath) {
    try { $notified = Get-Content $notifiedHistoryPath -Raw -Encoding UTF8 | ConvertFrom-Json -AsHashtable } catch {}
}
if ($null -eq $notified) { $notified = @{} }

# Load Telegram Config
$botToken = ""
$chatId = ""
if (Test-Path $tgConfigPath) {
    try {
        $tgCfg = Get-Content $tgConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $botToken = $tgCfg.BotToken
        $chatId = $tgCfg.ChatId
    } catch {}
}

$today = (Get-Date).Date

# Multi-Customer Delivery Schedule Registry
$deliveries = @(
    # Siam Yamamori (Sep 2026)
    @{ Customer = "Siam Yamamori"; Date = [DateTime]::ParseExact("05/09/2026", "dd/MM/yyyy", $null); Ref = "PO6908-2357"; Items = "แครอท 180 kg, หอมหัวใหญ่ 625 kg"; Month = "Sep" },
    @{ Customer = "Siam Yamamori"; Date = [DateTime]::ParseExact("10/09/2026", "dd/MM/yyyy", $null); Ref = "PO6908-2358"; Items = "แครอท 136 kg, หอมหัวใหญ่ 1,150 kg"; Month = "Sep" },
    
    # AFT - Ajinomoto Frozen Foods (Sep 2026)
    @{ Customer = "AFT"; Date = [DateTime]::ParseExact("01/09/2026", "dd/MM/yyyy", $null); Ref = "AFT-Plan-Sep01"; Items = "กะหล่ำปลี 2,500 kg, หอมใหญ่ปอกเปลือก 1,500 kg"; Month = "Sep" },
    @{ Customer = "AFT"; Date = [DateTime]::ParseExact("03/09/2026", "dd/MM/yyyy", $null); Ref = "AFT-Plan-Sep03"; Items = "กะหล่ำปลี 3,000 kg, หอมใหญ่ปอกเปลือก 1,100 kg"; Month = "Sep" },
    @{ Customer = "AFT"; Date = [DateTime]::ParseExact("05/09/2026", "dd/MM/yyyy", $null); Ref = "AFT-Plan-Sep05"; Items = "กะหล่ำปลี 2,000 kg, แครอท 630 kg, หอมใหญ่ปอกเปลือก 500 kg"; Month = "Sep" },
    @{ Customer = "AFT"; Date = [DateTime]::ParseExact("07/09/2026", "dd/MM/yyyy", $null); Ref = "AFT-Plan-Sep07"; Items = "กะหล่ำปลี 2,500 kg, หอมใหญ่ปอกเปลือก 1,500 kg"; Month = "Sep" },
    @{ Customer = "AFT"; Date = [DateTime]::ParseExact("08/09/2026", "dd/MM/yyyy", $null); Ref = "AFT-Plan-Sep08"; Items = "กะหล่ำปลี 2,500 kg, หอมใหญ่ปอกเปลือก 1,500 kg"; Month = "Sep" },
    @{ Customer = "AFT"; Date = [DateTime]::ParseExact("10/09/2026", "dd/MM/yyyy", $null); Ref = "AFT-Plan-Sep10"; Items = "กะหล่ำปลี 2,000 kg, หอมใหญ่ปอกเปลือก 2,000 kg"; Month = "Sep" },
    @{ Customer = "AFT"; Date = [DateTime]::ParseExact("12/09/2026", "dd/MM/yyyy", $null); Ref = "AFT-Plan-Sep12"; Items = "กะหล่ำปลี 2,500 kg, แครอท 630 kg, หอมใหญ่ปอกเปลือก 1,000 kg"; Month = "Sep" }
)

foreach ($deliv in $deliveries) {
    $dDate = $deliv.Date
    $key = "$($deliv.Customer)_$($deliv.Ref)_$($dDate.ToString('yyyyMMdd'))"
    
    # Calculate Alert Trigger Date
    $triggerDate = $dDate.AddDays(-2) # Default D-2
    $alertLeadText = "ล่วงหน้า 2 วัน (D-2)"
    $sampleDate = $dDate.AddDays(-2)
    
    if ($deliv.Customer -eq "AFT") {
        # AFT Rule: 1 Day before (D-1) at 12:00 PM. If D-1 is Sunday, shift to Saturday!
        $remindD1 = $dDate.AddDays(-1)
        if ($remindD1.DayOfWeek -eq [DayOfWeek]::Sunday) {
            $triggerDate = $remindD1.AddDays(-1)
            $alertLeadText = "ล่วงหน้า (เลื่อนจากวันอาทิตย์เป็นวันเสาร์ เวลา 12:00 น.)"
        } else {
            $triggerDate = $remindD1
            $alertLeadText = "ล่วงหน้า 1 วัน เวลา 12:00 น. (เที่ยงวัน)"
        }
        $sampleDate = $dDate.AddDays(-2)
    }
    
    $isAlertDay = ($today -eq $triggerDate)
    $daysUntilDelivery = ($dDate - $today).Days
    
    if ($isAlertDay -and $daysUntilDelivery -ge 0) {
        # STRICT LOCK: Only send ONCE per event key
        if (-not $notified.ContainsKey($key)) {
            $msg = @"
[แจ้งเตือนจัดทำ GT และส่งเอกสาร - $($deliv.Customer)]
กำหนดแจ้งเตือน: $alertLeadText

ลูกค้า: $($deliv.Customer)
วันที่ส่งมอบสินค้า: $($dDate.ToString('dd/MM/yyyy')) (อีก $daysUntilDelivery วัน)
วันที่สุ่มตัวอย่าง/ตรวจ GT: $($sampleDate.ToString('dd/MM/yyyy'))

รายการสินค้าตาม $($deliv.Ref):
• $($deliv.Items)

กรุณาตรวจสอบเอกสาร GT และเตรียมความพร้อมส่งมอบ
────────────────────
✨ ระบบแจ้งเตือนอัตโนมัติ บจก.ไพศาลเจริญ (1988)
"@
            if ($botToken -and $chatId) {
                Send-TGAlert -botToken $botToken -chatId $chatId -message $msg
                $notified[$key] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            }
        } else {
            Write-Output "Alert [$key] already notified on $($notified[$key]). Skipping to prevent duplicate."
        }
    }
}

$notified | ConvertTo-Json -Depth 3 | Set-Content -Path $notifiedHistoryPath -Encoding UTF8
