<#
.SYNOPSIS
    TNS Advanced Preparation Reminder Daemon
    Target Products: หอมแดง, เซเลอรี่, พริกหวาน, มะละกอ
    Lead times: 30, 20, 10, 5, 3 days in advance
#>
param (
    [string]$AgyBaseDir = "E:\agy",
    [string]$MasterSchedulePath = "E:\รวมงาน\งาน 25-26\Master_Order_Schedule_2026.xlsx"
)

$tgConfigPath = Join-Path $AgyBaseDir "telegram_config.json"
$notifiedHistoryPath = Join-Path $AgyBaseDir "notified_tns_alerts.json"

function Send-TGAlert {
    param ([string]$botToken, [string]$chatId, [string]$message)
    try {
        $body = @{ chat_id = $chatId; text = $message } | ConvertTo-Json -Compress
        $headers = @{ "Content-Type" = "application/json; charset=utf-8" }
        $url = "https://api.telegram.org/bot$botToken/sendMessage"
        Invoke-RestMethod -Uri $url -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -Headers $headers -TimeoutSec 15 | Out-Null
        Write-Output "Telegram alert sent successfully."
    } catch {
        Write-Output "Error sending Telegram alert: $_"
    }
}

# 1. Load Telegram Config
$botToken = ""
$chatId = ""
if (Test-Path $tgConfigPath) {
    try {
        $tgCfg = Get-Content $tgConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $botToken = $tgCfg.BotToken
        $chatId = $tgCfg.ChatId
    } catch {}
}

# 2. Load Notification History
$notified = @{}
if (Test-Path $notifiedHistoryPath) {
    try { $notified = Get-Content $notifiedHistoryPath -Raw -Encoding UTF8 | ConvertFrom-Json -AsHashtable } catch {}
}
if ($null -eq $notified) { $notified = @{} }

$today = (Get-Date).Date
$targetStages = @(20, 10, 5, 3)

Write-Output "=== TNS PREPARATION ALERT SYSTEM ==="
Write-Output "Running date: $($today.ToString('dd/MM/yyyy'))"
Write-Output "Target Crops: หอมแดง, ผักชีใหญ่, พริกหวาน, มะละกอ"
Write-Output "Alert intervals: 20, 10, 5, 3 days prior to delivery"

# 3. Define TNS Orders Schedule (Verified Ground Truth Only)
$tnsOrders = @(
    @{ Date = [DateTime]::ParseExact("07/09/2026", "dd/MM/yyyy", $null); Product = "หอมแดง"; Qty = 500; Unit = "kg" }
)

# 4. Evaluate Alert Triggers
$activeAlerts = @()

foreach ($order in $tnsOrders) {
    $delivDate = $order.Date
    $daysLeft = ($delivDate - $today).Days

    
    $isTarget = $targetStages -contains $daysLeft
    $isShallotSpecial = ($daysLeft -eq 2)

    if ($isTarget -or $isShallotSpecial) {
        if ($order.Product -eq "หอมแดง" -and $daysLeft -ne 2) { continue }
        if ($order.Product -ne "หอมแดง" -and $daysLeft -eq 2) { continue }

        $key = "TNS_$($order.Product)_$($delivDate.ToString('yyyyMMdd'))_D-$daysLeft"
        
        $stageAction = ""
        $stageBadge = ""
        switch ($daysLeft) {
            20 { $stageBadge = "📋 [ D-20 : เตรียมสั่งวัตถุดิบ (สำรวจแหล่งและจองยอด) ]"; $stageAction = "เตรียมสั่งวัตถุดิบล่วงหน้า: ประสานงานแหล่งปลูก/ซัพพลายเออร์ สำรวจปริมาณผลผลิตและจองยอด" }
            10 { $stageBadge = "📞 [ D-10 : เตรียมสั่งวัตถุดิบ (ติดตามและยืนยันยอด) ]"; $stageAction = "เตรียมสั่งวัตถุดิบ: ติดตามยืนยันยอดสั่งซื้อวัตถุดิบกับสวน/ผู้จำหน่าย ตรวจสอบความพร้อมจัดส่ง" }
            5  { $stageBadge = "🚚 [ D-5 : เตรียมสั่งวัตถุดิบ (คอนเฟิร์มวันขึ้นของและรถขนส่ง) ]"; $stageAction = "เตรียมสั่งวัตถุดิบ: ยืนยันการสั่งซื้อ นัดหมายวันขึ้นของ และจองคิวรถขนส่งห้องเย็น" }
            3  { $stageBadge = "🚨 [ D-3 : เตรียมสั่งวัตถุดิบ (สั่งตัดเข้าโรงงานเตรียมส่งมอบ) ]"; $stageAction = "เตรียมสั่งวัตถุดิบ: สั่งตัดและรับเข้าวัตถุดิบเข้าโรงงาน เพื่อเตรียมคัดแต่งบรรจุส่งมอบ TNS" }
            2  { $stageBadge = "🚨 [ D-2 : แจ้งเตือนสั่งหอมแดงก่อนวันขึ้นของ 1 วัน ]"; $stageAction = "แจ้งเตือนสั่งหอมแดง: ติดต่อป้าผาเพื่อสั่งหอมแดงก่อนขึ้นของพรุ่งนี้" }
        }

        $activeAlerts += @{
            Key = $key
            DaysLeft = $daysLeft
            Badge = $stageBadge
            Action = $stageAction
            Product = $order.Product
            Qty = $order.Qty
            Unit = $order.Unit
            DeliveryDate = $delivDate.ToString("dd/MM/yyyy")
        }
    }
}

if ($activeAlerts.Count -gt 0) {
    Write-Output "Found $($activeAlerts.Count) alert(s) triggered today!"
    
    foreach ($al in $activeAlerts) {
        $msg = @"
🔔 แจ้งเตือนจัดเตรียมสินค้า TNS
────────────────────
🏢 ลูกค้า: TNS (Thai Nippon Foods)
📦 สินค้า: $($al.Product)
⚖️ จำนวน: $($al.Qty) $($al.Unit)
📅 กำหนดส่งมอบ: $($al.DeliveryDate)
⏳ ระยะเวลา: ล่วงหน้า $($al.DaysLeft) วัน

$($al.Badge)
🎯 ขั้นตอนปฏิบัติ:
• $($al.Action)
────────────────────
✨ ระบบแจ้งเตือนอัตโนมัติ PSC
"@
        Write-Output "----------------------------------"
        Write-Output $msg
        
        if (-not $notified.ContainsKey($al.Key)) {
            if ($botToken -and $chatId) {
                Send-TGAlert -botToken $botToken -chatId $chatId -message $msg
                try {
                    $env:LINE_MSG = $msg
                    node -e "require('E:/agy/line_notifier.js').sendLineMessage(process.env.LINE_MSG);"
                } catch {}
                $notified[$al.Key] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            }
        } else {
            Write-Output "Alert [$($al.Key)] already notified previously."
        }
    }
    
    $notified | ConvertTo-Json -Depth 3 | Set-Content -Path $notifiedHistoryPath -Encoding UTF8
} else {
    Write-Output "No D-30, D-20, D-10, D-5, or D-3 alerts triggered for today ($($today.ToString('dd/MM/yyyy')))."
}
