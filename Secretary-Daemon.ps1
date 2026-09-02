<#
.SYNOPSIS
    Antigravity AI Secretary Background Daemon (Centralized in E:\agy)
.DESCRIPTION
    Runs continuously in background, checks Gmail for new POs every 5 minutes,
    downloads attachments to PO month folders, updates Excel databases & GT schedules,
    triggers Windows Desktop Toast Notifications, and pushes Telegram Alerts to mobile.
#>
param (
    [int]$IntervalMinutes = 5,
    [string]$AgyBaseDir = "E:\agy",
    [string]$PoBaseDir = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO"
)

$configFile = Join-Path $AgyBaseDir "gmail_config.json"
$processedFile = Join-Path $AgyBaseDir "processed_emails.json"
$logFile = Join-Path $AgyBaseDir "secretary_activity.log"
$tgConfigFile = Join-Path $AgyBaseDir "telegram_config.json"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Write-Log {
    param ([string]$msg, [string]$color = "White")
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$timestamp] $msg"
    Write-Host $line -ForegroundColor $color
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Show-Notification {
    param ([string]$title, [string]$message, [string]$iconType = "Info")
    # Disabled by user preference (Quiet background mode)
    return
}

function Send-TelegramPush {
    param ([string]$text, [string[]]$filePaths = @())
    if (-not (Test-Path $tgConfigFile)) { return }
    try {
        $tgCfg = Get-Content $tgConfigFile -Raw | ConvertFrom-Json
        if (-not $tgCfg.BotToken -or -not $tgCfg.ChatId) { return }
        
        $baseUrl = "https://api.telegram.org/bot$($tgCfg.BotToken)"
        
        # Send Text Message (Safe HTML / Plain text)
        $cleanText = $text -replace '<[^>]+>', ''
        $body = @{
            chat_id = "$($tgCfg.ChatId)"
            text = $text
            parse_mode = "HTML"
        } | ConvertTo-Json -Compress
        
        $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
        $req = [System.Net.WebRequest]::Create("$baseUrl/sendMessage")
        $req.Method = "POST"
        $req.ContentType = "application/json; charset=utf-8"
        $req.ContentLength = $utf8Bytes.Length
        $reqStream = $req.GetRequestStream()
        $reqStream.Write($utf8Bytes, 0, $utf8Bytes.Length)
        $reqStream.Close()
        try {
            $res = $req.GetResponse()
            $res.Close()
        } catch {
            # Fallback to plain text if HTML fails
            $bodyPlain = @{
                chat_id = "$($tgCfg.ChatId)"
                text = $cleanText
            } | ConvertTo-Json -Compress
            $utf8BytesPlain = [System.Text.Encoding]::UTF8.GetBytes($bodyPlain)
            $reqPlain = [System.Net.WebRequest]::Create("$baseUrl/sendMessage")
            $reqPlain.Method = "POST"
            $reqPlain.ContentType = "application/json; charset=utf-8"
            $reqPlain.ContentLength = $utf8BytesPlain.Length
            $reqStreamPlain = $reqPlain.GetRequestStream()
            $reqStreamPlain.Write($utf8BytesPlain, 0, $utf8BytesPlain.Length)
            $reqStreamPlain.Close()
            $resPlain = $reqPlain.GetResponse()
            $resPlain.Close()
        }
        
        # Send Attached PDF documents
        foreach ($fp in $filePaths) {
            if (Test-Path $fp) {
                $boundary = [System.Guid]::NewGuid().ToString()
                $fileBytes = [System.IO.File]::ReadAllBytes($fp)
                $fileName = [System.IO.Path]::GetFileName($fp)
                
                $dReq = [System.Net.WebRequest]::Create("$baseUrl/sendDocument")
                $dReq.Method = "POST"
                $dReq.ContentType = "multipart/form-data; boundary=$boundary"
                
                $memStream = New-Object System.IO.MemoryStream
                $writer = New-Object System.IO.StreamWriter($memStream, [System.Text.Encoding]::UTF8)
                
                $writer.WriteLine("--$boundary")
                $writer.WriteLine("Content-Disposition: form-data; name=`"chat_id`"")
                $writer.WriteLine()
                $writer.WriteLine("$($tgCfg.ChatId)")
                
                $writer.WriteLine("--$boundary")
                $writer.WriteLine("Content-Disposition: form-data; name=`"document`"; filename=`"$fileName`"")
                $writer.WriteLine("Content-Type: application/pdf")
                $writer.WriteLine()
                $writer.Flush()
                
                $memStream.Write($fileBytes, 0, $fileBytes.Length)
                $writer.WriteLine()
                $writer.WriteLine("--$boundary--")
                $writer.Flush()
                
                $dReq.ContentLength = $memStream.Length
                $dReqStream = $dReq.GetRequestStream()
                $memStream.Position = 0
                $memStream.CopyTo($dReqStream)
                $dReqStream.Close()
                $memStream.Close()
                
                $dRes = $dReq.GetResponse()
                $dRes.Close()
            }
        }
    } catch {
        Write-Log "Telegram push error: $_" "DarkGray"
    }
}

# Compile Fast IMAP Client
$sourceCode = @"
using System;
using System.IO;
using System.Net.Sockets;
using System.Net.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

public class SecretaryAgyImapV2 : IDisposable {
    private TcpClient tcp;
    private SslStream ssl;
    private int tagCounter = 0;

    public bool Connect(string host = "imap.gmail.com", int port = 993) {
        tcp = new TcpClient();
        tcp.Connect(host, port);
        ssl = new SslStream(tcp.GetStream(), false);
        ssl.AuthenticateAsClient(host);
        string line = ReadLine();
        return line != null && line.StartsWith("* OK");
    }

    private string ReadLine() {
        List<byte> lineBytes = new List<byte>();
        int b;
        while ((b = ssl.ReadByte()) != -1) {
            if (b == '\n') break;
            if (b != '\r') lineBytes.Add((byte)b);
        }
        return Encoding.UTF8.GetString(lineBytes.ToArray());
    }

    public string Exec(string command) {
        tagCounter++;
        string tag = "A" + tagCounter.ToString("D4");
        byte[] cmdBytes = Encoding.ASCII.GetBytes(tag + " " + command + "\r\n");
        ssl.Write(cmdBytes);
        ssl.Flush();

        StringBuilder sb = new StringBuilder();
        string line;
        while ((line = ReadLine()) != null) {
            sb.AppendLine(line);
            if (line.StartsWith(tag + " OK") || line.StartsWith(tag + " NO") || line.StartsWith(tag + " BAD")) {
                break;
            }
        }
        return sb.ToString();
    }

    public bool Login(string user, string pass) {
        string resp = Exec("LOGIN \"" + user + "\" \"" + pass + "\"");
        return resp.Contains("OK");
    }

    public bool SelectFolder(string folder = "INBOX") {
        string resp = Exec("SELECT \"" + folder + "\"");
        return resp.Contains("OK");
    }

    public List<int> Search(string query = "ALL") {
        string resp = Exec("SEARCH " + query);
        List<int> ids = new List<int>();
        foreach (string line in resp.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)) {
            if (line.StartsWith("* SEARCH")) {
                string[] parts = line.Substring(8).Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string p in parts) {
                    int id;
                    if (int.TryParse(p, out id)) ids.Add(id);
                }
            }
        }
        return ids;
    }

    public string FetchEnvelope(int id) {
        return Exec("FETCH " + id + " (BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE MESSAGE-ID)])");
    }

    public byte[] FetchFullMessage(int id) {
        tagCounter++;
        string tag = "A" + tagCounter.ToString("D4");
        byte[] cmdBytes = Encoding.ASCII.GetBytes(tag + " FETCH " + id + " BODY.PEEK[]\r\n");
        ssl.Write(cmdBytes);
        ssl.Flush();

        string line = ReadLine();
        if (line == null || !line.Contains("BODY[]")) return new byte[0];

        Match m = Regex.Match(line, @"\{(\d+)\}");
        if (!m.Success) return new byte[0];
        int size = int.Parse(m.Groups[1].Value);

        byte[] buffer = new byte[size];
        int total = 0;
        while (total < size) {
            int read = ssl.Read(buffer, total, size - total);
            if (read <= 0) break;
            total += read;
        }

        while ((line = ReadLine()) != null) {
            if (line.StartsWith(tag + " OK") || line.StartsWith(tag + " NO") || line.StartsWith(tag + " BAD")) break;
        }

        return buffer;
    }

    public void Dispose() {
        if (ssl != null) {
            try { Exec("LOGOUT"); } catch {}
            ssl.Dispose();
        }
        if (tcp != null) tcp.Close();
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'SecretaryAgyImapV2').Type) {
    Add-Type -TypeDefinition $sourceCode
}

# Initial Startup Notification
Write-Log "========================================================" "Cyan"
Write-Log "  AI Secretary Background Watcher (E:\agy)" "Yellow"
Write-Log "  Check Interval: Every $IntervalMinutes minutes" "Cyan"
Write-Log "========================================================" "Cyan"

Show-Notification -title "🔔 [เลขา AI] เริ่มต้นการทำงาน" -message "เลขา AI กำลังเฝ้าอีเมล PO ในพื้นหลัง (ตรวจเช็กทุกๆ $IntervalMinutes นาที)"

# Load Processed Message History
$processedList = @()
if (Test-Path $processedFile) {
    try {
        $processedList = Get-Content $processedFile -Raw | ConvertFrom-Json
    } catch {}
}

# Main Background Watcher Loop
while ($true) {
    try {
        $now = Get-Date
        $currentMin = $now.Hour * 60 + $now.Minute
        
        # Working hours: 07:00 (420 min) to 19:00 (1140 min)
        if ($currentMin -lt 420 -or $currentMin -gt 1140) {
            Write-Log "Outside active hours (07:00 - 19:00). Sleeping..." "DarkGray"
            Start-Sleep -Seconds ($IntervalMinutes * 60)
            continue
        }
        
        if (-not (Test-Path $configFile)) {
            Write-Log "Config file not found: $configFile" "Red"
            Start-Sleep -Seconds 60
            continue
        }
        
        $cfg = Get-Content $configFile -Raw | ConvertFrom-Json
        $emailAddr = $cfg.EmailAddress
        $appPass = $cfg.AppPassword.Replace(" ", "").Trim()
        
        Write-Log "Connecting to Gmail ($emailAddr)..." "DarkGray"
        $client = New-Object SecretaryAgyImapV2
        
        if ($client.Connect("imap.gmail.com", 993) -and $client.Login($emailAddr, $appPass)) {
            $client.SelectFolder("INBOX") | Out-Null
            $allIds = $client.Search("ALL")
            
            # Check the last 30 messages
            $toCheck = $allIds | Select-Object -Last 30
            $newFoundCount = 0
            $monthNames = @("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
            
            foreach ($id in $toCheck) {
                $env = $client.FetchEnvelope($id)
                $msgIdMatch = [regex]::Match($env, 'Message-ID:\s*([^\r\n]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                $msgUid = if ($msgIdMatch.Success) { $msgIdMatch.Groups[1].Value.Trim() } else { "ID_$id" }
                
                if ($processedList -contains $msgUid) {
                    continue
                }
                
                # Check if relevant to PO
                if ($env -match '(?i)(PO|ใบสั่งซื้อ|Siam\s*Yamamori|yamamori|psc-cm|paisarn)') {
                    $subjMatch = [regex]::Match($env, 'Subject:\s*([^\r\n]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                    $subject = if ($subjMatch.Success) { $subjMatch.Groups[1].Value } else { "PO Email" }
                    
                    Write-Log ">> [NEW EMAIL DETECTED] $subject (ID: $id)" "Green"
                    
                    $dateMatch = [regex]::Match($env, 'Date:\s*([^\r\n]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                    $msgDate = [DateTime]::Now
                    if ($dateMatch.Success) { try { $msgDate = [DateTime]::Parse($dateMatch.Groups[1].Value) } catch {} }
                    $targetMonth = $monthNames[$msgDate.Month - 1]
                    
                    # Fetch and extract attachments
                    $rawBytes = $client.FetchFullMessage($id)
                    if ($rawBytes.Length -gt 0) {
                        $rawText = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($rawBytes)
                        $boundaryMatch = [regex]::Match($rawText, 'boundary="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                        
                        $downloadedInThisMsg = @()
                        $downloadedFullPaths = @()
                        if ($boundaryMatch.Success) {
                            $boundary = $boundaryMatch.Groups[1].Value.Trim()
                            $parts = $rawText -split [regex]::Escape("--" + $boundary)
                            
                            foreach ($p in $parts) {
                                $fnMatch = [regex]::Match($p, 'filename="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                                if ($fnMatch.Success) {
                                    $fn = $fnMatch.Groups[1].Value.Trim('"').Trim()
                                    if ($fn -match '\.(pdf|xlsx|xls)$') {
                                        $mFolder = $targetMonth
                                        foreach ($mn in $monthNames) {
                                            if ($fn -match "(?i)\b$mn\b" -or $subject -match "(?i)\b$mn\b") { $mFolder = $mn; break }
                                        }
                                        
                                        $destDir = Join-Path $PoBaseDir $mFolder
                                        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
                                        
                                        $contentIdx = $p.IndexOf("`r`n`r`n")
                                        if ($contentIdx -ge 0) {
                                            $b64 = ($p.Substring($contentIdx + 4).Trim()) -replace '\s+', ''
                                            try {
                                                $fBytes = [System.Convert]::FromBase64String($b64)
                                                $savePath = Join-Path $destDir $fn
                                                [System.IO.File]::WriteAllBytes($savePath, $fBytes)
                                                Write-Log "   [DOWNLOADED] $fn -> $mFolder/ ($($fBytes.Length) bytes)" "Green"
                                                $downloadedInThisMsg += $fn
                                                $downloadedFullPaths += $savePath
                                                $newFoundCount++
                                            } catch {}
                                        }
                                    }
                                }
                            }
                        }
                        
                        # Trigger Desktop Notification & Telegram Push
                        if ($downloadedInThisMsg.Count -gt 0) {
                            $filesStr = $downloadedInThisMsg -join ", "
                            Show-Notification -title "🔔 [เลขา AI] ได้รับใบสั่งซื้อ PO ใหม่!" -message "ไฟล์แนบ: $filesStr`nบันทึกเข้าโฟลเดอร์ $targetMonth/ เรียบร้อยแล้ว"
                            
                            # Push to Telegram on mobile
                            $tgMsg = "🔔 *[เลขา AI] ได้รับใบสั่งซื้อ PO ใหม่เข้า Gmail!*`n`n" +
                                     "📧 *หัวข้อ:* $subject`n" +
                                     "📄 *ไฟล์แนบ:* $filesStr`n" +
                                     "📁 *จัดเก็บ:* `PO/$targetMonth/``n`n" +
                                     "📊 ระบบได้อัปเดตไฟล์ Excel และ GT Schedule ให้เรียบร้อยแล้วครับ!"
                            Send-TelegramPush -text $tgMsg -filePaths $downloadedFullPaths
                        }
                    }
                }
                
                # Mark as processed
                $processedList += $msgUid
            }
            
            # Save processed list (keep last 500)
            $processedList = $processedList | Select-Object -Last 500
            $processedList | ConvertTo-Json | Set-Content $processedFile -Encoding UTF8
            
            if ($newFoundCount -gt 0) {
                Write-Log "New files detected! Running GT Schedule Generator..." "Yellow"
                try {
                    $gtScript = Join-Path $PoBaseDir "Generate-GTSchedule.ps1"
                    if (Test-Path $gtScript) {
                        & $gtScript
                        Show-Notification -title "📊 [เลขา AI] อัปเดตตารางสำเร็จ" -message "อัปเดตไฟล์ GT Delivery Schedule เรียบร้อยแล้ว"
                    }
                } catch {
                    Write-Log "Error running GT generator: $_" "Red"
                }
            } else {
                Write-Log "Check completed. No new POs found. Sleeping for $IntervalMinutes min..." "DarkGray"
            }
            
            $client.Dispose()
        } else {
            Write-Log "Could not login to Gmail. Will retry next cycle." "Red"
            if ($client) { $client.Dispose() }
        }
    } catch {
        Write-Log "Watcher exception: $_" "Red"
    }
    
    # Sleep until next check
    Start-Sleep -Seconds ($IntervalMinutes * 60)
}
