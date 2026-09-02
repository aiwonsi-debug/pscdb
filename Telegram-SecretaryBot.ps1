<#
.SYNOPSIS
    Antigravity Telegram AI Secretary Bot (Fast & Robust via curl.exe)
.DESCRIPTION
    Receives commands from Telegram mobile app, performs PO sync, checks status,
    and returns summaries or PDF files directly to chat.
#>
param (
    [string]$AgyBaseDir = "E:\agy",
    [string]$PoBaseDir = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO",
    [string]$ConfigFile = "E:\agy\telegram_config.json"
)

$ErrorActionPreference = "Continue"

# Load config
if (-not (Test-Path $ConfigFile)) {
    Write-Error "Config file not found: $ConfigFile"
    exit 1
}

$cfg = Get-Content $ConfigFile -Raw | ConvertFrom-Json
$botToken = $cfg.BotToken
$adminChatId = $cfg.ChatId

function Send-TGMsg {
    param ([string]$chatId, [string]$text)
    $escaped = $text
    curl.exe -s -X POST "https://api.telegram.org/bot$botToken/sendMessage" -d "chat_id=$chatId" --data-urlencode "text=$escaped" | Out-Null
}

function Send-TGDoc {
    param ([string]$chatId, [string]$filePath, [string]$caption = "")
    if (-not (Test-Path $filePath)) { return }
    curl.exe -s -X POST "https://api.telegram.org/bot$botToken/sendDocument" -F "chat_id=$chatId" -F "document=@$filePath" -F "caption=$caption" | Out-Null
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Telegram Secretary Bot Started" -ForegroundColor Yellow
Write-Host "  Bot: @attgeminicli_bot" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

$lastUpdateId = 0

while ($true) {
    try {
        $jsonStr = curl.exe -s "https://api.telegram.org/bot$botToken/getUpdates?offset=$($lastUpdateId + 1)&timeout=10"
        if ([string]::IsNullOrWhiteSpace($jsonStr)) {
            Start-Sleep -Seconds 2
            continue
        }
        
        $res = $jsonStr | ConvertFrom-Json
        if ($res.ok -and $res.result.Count -gt 0) {
            foreach ($upd in $res.result) {
                $lastUpdateId = $upd.update_id
                
                if (-not $upd.message -or -not $upd.message.text) { continue }
                
                $msg = $upd.message
                $chatId = "$($msg.chat.id)"
                $name = "$($msg.from.first_name)"
                $text = $msg.text.Trim()
                
                Write-Host "[MSG] From: $name ($chatId) -> $text" -ForegroundColor Cyan
                
                # Update AdminChatId
                if ($adminChatId -ne $chatId) {
                    $adminChatId = $chatId
                    $cfg.ChatId = $adminChatId
                    $cfg | ConvertTo-Json | Set-Content $ConfigFile -Encoding UTF8
                }
                
                # Handle Commands
                if ($text -eq "/start" -or $text -eq "/help" -or $text -eq "เมนู" -or $text -eq "help") {
                    $reply = "👋 สวัสดีครับคุณ $name`n" +
                             "ผมคือ เลขา AI (Antigravity Assistant)`n`n" +
                             "📋 เมนูคำสั่งที่คุณสามารถพิมพ์สั่งได้:`n" +
                             "• /check หรือ 'เช็กเมล' -> สั่งดึง PO ใหม่จาก Gmail ทันที`n" +
                             "• /status หรือ 'สถานะ' -> ดูสถานะระบบเลขาและประวัติ`n" +
                             "• /po หรือ 'สรุป po' -> ดูสรุปรายการ PO และวันส่งมอบ`n" +
                             "• /latest หรือ 'ไฟล์ล่าสุด' -> ให้เลขา ส่งไฟล์ PDF ใบสั่งซื้อล่าสุดเข้าแชท`n" +
                             "• /gt หรือ 'อัปเดต gt' -> คำนวณและอัปเดตไฟล์ GT Schedule`n`n" +
                             "💡 คุณสามารถพิมพ์ข้อความสั่งงานได้ตลอดเวลาครับ"
                    Send-TGMsg -chatId $chatId -text $reply
                }
                elseif ($text -eq "/check" -or $text -like "*เช็กเมล*" -or $text -like "*ดึง po*") {
                    Send-TGMsg -chatId $chatId -text "⏳ กำลังเชื่อมต่อ Gmail เพื่อตรวจสอบ PO ใหม่และอัปเดตระบบ..."
                    
                    try {
                        $fetchScript = Join-Path $AgyBaseDir "Fetch-GmailPO.ps1"
                        $out = & $fetchScript -AutoProcessGT 2>&1 | Out-String
                        
                        $downloadMatches = [regex]::Matches($out, '\[SAVED\]\s*([^\r\n]+)')
                        if ($downloadMatches.Count -gt 0) {
                            $r = "✅ ดึงข้อมูลสำเร็จ! พบ $($downloadMatches.Count) ไฟล์ใหม่:`n"
                            foreach ($dm in $downloadMatches) { $r += "📄 " + $dm.Groups[1].Value + "`n" }
                            $r += "`n📊 อัปเดตไฟล์ Excel และ GT Schedule เรียบร้อยแล้วครับ!"
                            Send-TGMsg -chatId $chatId -text $r
                        } else {
                            Send-TGMsg -chatId $chatId -text "✅ ตรวจสอบแล้ว ไม่มีอีเมล PO ใหม่เพิ่มเติมครับ"
                        }
                    } catch {
                        Send-TGMsg -chatId $chatId -text "❌ เกิดข้อผิดพลาด: $_"
                    }
                }
                elseif ($text -eq "/status" -or $text -like "*สถานะ*") {
                    $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*Secretary-Daemon.ps1*" }
                    $st = if ($procs) { "🟢 ทำงานอยู่ (RUNNING)" } else { "🔴 หยุดทำงาน (STOPPED)" }
                    
                    $logTail = "ไม่มีข้อมูล"
                    $logP = Join-Path $AgyBaseDir "secretary_activity.log"
                    if (Test-Path $logP) { $logTail = (Get-Content $logP -Tail 5) -join "`n" }
                    
                    $r = "📊 สถานะระบบเลขา AI (AGY):`n`n" +
                         "• Background Daemon: $st`n" +
                         "• รอบตรวจเช็ก: ทุกๆ 5 นาที`n" +
                         "• บัญชี Gmail: psccnx@gmail.com`n`n" +
                         "📝 บันทึกล่าสุด:`n$logTail"
                    Send-TGMsg -chatId $chatId -text $r
                }
                elseif ($text -eq "/po" -or $text -like "*สรุป po*" -or $text -like "*ยอดส่ง*") {
                    $r = "📊 สรุปข้อมูล PO และรอบการส่งมอบล่าสุด:`n`n" +
                         "📅 เดือนสิงหาคม (Aug 2026):`n" +
                         "• หอมหัวใหญ่ (Onion): 9 วันส่งมอบ (Seq 53-61)`n" +
                         "• แครอท (Carrot): 9 วันส่งมอบ (Seq 49-57)`n" +
                         "• มะเขือเปราะ (Egg Plant): 3 วันส่งมอบ (Seq 4-6)`n`n" +
                         "📅 เดือนกันยายน (Sep 2026):`n" +
                         "• แผนจัดซื้อและใบเสนอราคาใหม่จัดเก็บเรียบร้อยแล้ว`n`n" +
                         "💡 พิมพ์ /latest เพื่อให้ส่งไฟล์ PDF ใบสั่งซื้อล่าสุดเข้าแชทได้ครับ"
                    Send-TGMsg -chatId $chatId -text $r
                }
                elseif ($text -eq "/latest" -or $text -like "*ไฟล์ล่าสุด*" -or $text -like "*ส่ง po*") {
                    $allPdfs = Get-ChildItem -Path $PoBaseDir -Filter "*.pdf" -Recurse | Where-Object { $_.Name -notlike "COA*" } | Sort-Object LastWriteTime -Descending
                    if ($allPdfs.Count -gt 0) {
                        $topPdf = $allPdfs[0]
                        Send-TGMsg -chatId $chatId -text "📄 ส่งไฟล์ PO ล่าสุดให้ครับ: $($topPdf.Name)"
                        Send-TGDoc -chatId $chatId -filePath $topPdf.FullName -caption "PO: $($topPdf.Name)"
                    } else {
                        Send-TGMsg -chatId $chatId -text "ไม่พบไฟล์ PDF ในโฟลเดอร์ครับ"
                    }
                }
                elseif ($text -eq "/gt" -or $text -like "*อัปเดต gt*") {
                    Send-TGMsg -chatId $chatId -text "⏳ กำลังคำนวณและอัปเดตไฟล์ GT Schedule ทุกเดือน..."
                    try {
                        $gtScript = Join-Path $PoBaseDir "Generate-GTSchedule.ps1"
                        $null = & $gtScript
                        Send-TGMsg -chatId $chatId -text "✅ อัปเดต GT Schedule สำเร็จเรียบร้อยแล้วครับ!"
                    } catch {
                        Send-TGMsg -chatId $chatId -text "❌ เกิดข้อผิดพลาด: $_"
                    }
                }
                else {
                    $r = "🤖 รับทราบครับ: `"$text`"`n`nคุณสามารถพิมพ์สั่งงานได้ดังนี้:`n• /check - เช็กเมล PO ใหม่`n• /po - ดูสรุปยอดส่งมอบ`n• /latest - ขอไฟล์ PDF ล่าสุด`n• /status - ดูสถานะระบบ`n• /help - ดูเมนูทั้งหมดครับ"
                    Send-TGMsg -chatId $chatId -text $r
                }
            }
        }
    } catch {
        Write-Warning "Bot Loop Error: $_"
        Start-Sleep -Seconds 3
    }
}
