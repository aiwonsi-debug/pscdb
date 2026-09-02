<#
.SYNOPSIS
    Recheck Gmail PO/Order emails from psccnx@gmail.com
    Date range: Late July 2026 (from 20-Jul) + All of August 2026
    Saves files and prints a full summary for comparison with existing records.
#>

$ErrorActionPreference = "Stop"
$AgyBaseDir = "E:\agy"
$ConfigFile = Join-Path $AgyBaseDir "gmail_config.json"
$BaseWorkDir = "E:\รวมงาน\งาน 25-26"

# Load config
$cfg = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
$EmailAddress = $cfg.EmailAddress
$AppPassword  = $cfg.AppPassword.Replace(" ", "").Trim()

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " RECHECK: psccnx@gmail.com" -ForegroundColor Cyan
Write-Host " Period : 20 Jul 2026 - 31 Aug 2026" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$sourceCode = @"
using System;
using System.IO;
using System.Net.Sockets;
using System.Net.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

public class RecheckImapClient : IDisposable {
    private TcpClient tcp;
    private SslStream ssl;
    private int tagCounter = 0;

    public bool Connect(string host, int port) {
        tcp = new TcpClient();
        tcp.ReceiveTimeout = 30000;
        tcp.SendTimeout    = 30000;
        tcp.Connect(host, port);
        ssl = new SslStream(tcp.GetStream(), false);
        ssl.ReadTimeout  = 30000;
        ssl.WriteTimeout = 30000;
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
        string tag = "R" + tagCounter.ToString("D4");
        byte[] cmdBytes = Encoding.ASCII.GetBytes(tag + " " + command + "\r\n");
        ssl.Write(cmdBytes);
        ssl.Flush();
        StringBuilder sb = new StringBuilder();
        string line;
        while ((line = ReadLine()) != null) {
            sb.AppendLine(line);
            if (line.StartsWith(tag + " OK") || line.StartsWith(tag + " NO") || line.StartsWith(tag + " BAD")) break;
        }
        return sb.ToString();
    }

    public bool Login(string user, string pass) {
        return Exec("LOGIN \"" + user + "\" \"" + pass + "\"").Contains("OK");
    }

    public bool SelectFolder(string folder) {
        return Exec("SELECT \"" + folder + "\"").Contains("OK");
    }

    public List<int> Search(string query) {
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
        tagCounter++;
        string tag = "R" + tagCounter.ToString("D4");
        byte[] cmdBytes = Encoding.ASCII.GetBytes(tag + " FETCH " + id + " (BODY[HEADER.FIELDS (FROM TO SUBJECT DATE)])\r\n");
        ssl.Write(cmdBytes);
        ssl.Flush();
        StringBuilder sb = new StringBuilder();
        string line;
        while ((line = ReadLine()) != null) {
            sb.AppendLine(line);
            if (line.StartsWith(tag + " OK") || line.StartsWith(tag + " NO") || line.StartsWith(tag + " BAD")) break;
        }
        return sb.ToString();
    }

    public byte[] FetchFullMessage(int id) {
        tagCounter++;
        string tag = "R" + tagCounter.ToString("D4");
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
        if (ssl != null) { try { Exec("LOGOUT"); } catch {} ssl.Dispose(); }
        if (tcp != null) tcp.Close();
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'RecheckImapClient').Type) {
    Add-Type -TypeDefinition $sourceCode
}

$client  = New-Object RecheckImapClient
$summary = @()

try {
    if (-not $client.Connect("imap.gmail.com", 993)) { Write-Error "IMAP connect failed"; exit 1 }
    if (-not $client.Login($EmailAddress, $AppPassword)) { Write-Error "Login failed"; exit 1 }

    Write-Host "[OK] Logged in as $EmailAddress" -ForegroundColor Green

    $client.SelectFolder("INBOX") | Out-Null

    Write-Host "[*] Searching: SINCE 20-Jul-2026 BEFORE 01-Sep-2026 ..." -ForegroundColor Yellow
    $ids = $client.Search("SINCE 20-Jul-2026 BEFORE 01-Sep-2026")
    Write-Host "[*] Found $($ids.Count) emails in range" -ForegroundColor Yellow

    $monthNames = @("Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")

    foreach ($id in $ids) {
        $env = $client.FetchEnvelope($id)

        $subjMatch = [regex]::Match($env, 'Subject:\s*([^\r\n]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $fromMatch = [regex]::Match($env, 'From:\s*([^\r\n]+)',    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $dateMatch = [regex]::Match($env, 'Date:\s*([^\r\n]+)',    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

        $subject = if ($subjMatch.Success) { $subjMatch.Groups[1].Value.Trim() } else { "(no subject)" }
        $from    = if ($fromMatch.Success) { $fromMatch.Groups[1].Value.Trim() } else { "" }
        $dateStr = if ($dateMatch.Success) { $dateMatch.Groups[1].Value.Trim() } else { "" }

        $msgDate = [DateTime]::Now
        if ($dateStr) { try { $msgDate = [DateTime]::Parse($dateStr) } catch {} }
        $targetMonth = $monthNames[$msgDate.Month - 1]
        $targetYear  = $msgDate.Year.ToString()
        $dateLabel   = $msgDate.ToString("dd/MM/yyyy")

        # Skip non-order emails
        if ($env -notmatch '(?i)(PO|Order|ใบสั่งซื้อ|nisshin|tns|aft|ajinomoto|yamamori|oishi|purchasing\s*plan|\d{4}-\d{4})') {
            continue
        }

        # Classify customer
        $customerName = "Siam Yamamori"
        if ($from -match '(?i)nisshin|tns|nisshinthai|nattapat' -or $subject -match '(?i)nisshin|tns|nisshinthai|psc\s*order|order\s*psc') {
            $customerName = "TNS"
        } elseif ($from -match '(?i)aft|ajinomoto|warisara' -or $subject -match '(?i)aft|ajinomoto|vegetable\s*purchasing') {
            $customerName = "AFT"
        } elseif ($from -match '(?i)oishi' -or $subject -match '(?i)oishi') {
            $customerName = "Oishi"
        }

        $rawBytes = $client.FetchFullMessage($id)
        if ($rawBytes.Length -eq 0) { continue }

        $rawText = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($rawBytes)
        $boundaryMatch = [regex]::Match($rawText, 'boundary="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

        if (-not $boundaryMatch.Success) {
            $summary += [PSCustomObject]@{ Date=$dateLabel; Customer=$customerName; From=$from; Subject=$subject; File="(no attachment)"; Status="NO_ATTACHMENT"; Path="" }
            continue
        }

        $boundary      = $boundaryMatch.Groups[1].Value.Trim()
        $parts         = $rawText -split [regex]::Escape("--" + $boundary)
        $hasAttachment = $false

        foreach ($p in $parts) {
            $fnMatch = [regex]::Match($p, 'filename="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if (-not $fnMatch.Success) { continue }
            $filename = $fnMatch.Groups[1].Value.Trim('"').Trim()
            if ($filename -notmatch '\.(pdf|xlsx|xls|csv|zip)$') { continue }

            $hasAttachment = $true
            $docType = "PO"
            $destDir = ""

            if ($filename -match '^(?i)(GT[\s_-]|Good\s*Transportation)') {
                $docType = "GT"
                $destDir = Join-Path (Join-Path $BaseWorkDir "AFT") "GT"
            } elseif ($filename -match '^(?i)(Record[\s_-]|บันทึกเพาะปลูก|CB-SM)') {
                $docType = "Record"
                $destDir = Join-Path (Join-Path (Join-Path $BaseWorkDir "AFT") "บันทึกเพาะปลูกกะหล่ำปลี") "$targetYear(4)"
            } elseif ($filename -match '^(?i)(COA[\s_-]|Audit|Certificate)') {
                $docType = "COA"
                $destDir = Join-Path (Join-Path $BaseWorkDir "AFT") "COA"
            } else {
                if ($filename -match '(?i)Order\s*PSC\.xlsx') { $customerName = "TNS" }
                $destDir = if ($customerName -eq "AFT" -or $customerName -eq "TNS") {
                    Join-Path (Join-Path (Join-Path (Join-Path $BaseWorkDir $customerName) "PO") $targetYear) $targetMonth
                } else {
                    Join-Path (Join-Path (Join-Path $BaseWorkDir $customerName) "PO") $targetMonth
                }
            }

            $contentIdx = $p.IndexOf("`r`n`r`n")
            if ($contentIdx -lt 0) { continue }

            $b64 = ($p.Substring($contentIdx + 4).Trim()) -replace '\s+', ''
            try {
                $fileBytes = [System.Convert]::FromBase64String($b64)
                if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
                $destPath = Join-Path $destDir $filename

                $status = "SAVED_NEW"
                if (Test-Path $destPath) {
                    $existingSize = (Get-Item $destPath).Length
                    $status = if ($existingSize -eq $fileBytes.Length) { "ALREADY_EXISTS_SAME" } else { "OVERWRITTEN_UPDATED" }
                    if ($status -eq "OVERWRITTEN_UPDATED") {
                        [System.IO.File]::WriteAllBytes($destPath, $fileBytes)
                    }
                } else {
                    [System.IO.File]::WriteAllBytes($destPath, $fileBytes)
                }

                $summary += [PSCustomObject]@{ Date=$dateLabel; Customer=$customerName; From=$from; Subject=$subject; File=$filename; Status=$status; Path=$destPath }

                $color = if ($status -eq "SAVED_NEW") { "Green" } elseif ($status -eq "OVERWRITTEN_UPDATED") { "Yellow" } else { "DarkGray" }
                Write-Host ("  [{0,-20}] {1} | {2}" -f $status, $customerName, $filename) -ForegroundColor $color
            } catch {
                Write-Host "  [ERROR] $filename : $_" -ForegroundColor Red
            }
        }

        if (-not $hasAttachment) {
            $summary += [PSCustomObject]@{ Date=$dateLabel; Customer=$customerName; From=$from; Subject=$subject; File="(no attachment)"; Status="NO_ATTACHMENT"; Path="" }
        }
    }

} finally {
    $client.Dispose()
}

# ==================== REPORT ====================
Write-Host ("`n" + "=" * 60) -ForegroundColor Cyan
Write-Host " RECHECK SUMMARY — Late Jul + Aug 2026" -ForegroundColor Cyan
Write-Host ("=" * 60) -ForegroundColor Cyan

foreach ($grp in ($summary | Group-Object Customer)) {
    Write-Host "`n[$($grp.Name)]" -ForegroundColor White
    foreach ($row in ($grp.Group | Sort-Object Date)) {
        $icon = switch ($row.Status) {
            "SAVED_NEW"           { "NEW  " }
            "ALREADY_EXISTS_SAME" { "OK   " }
            "OVERWRITTEN_UPDATED" { "UPD  " }
            "NO_ATTACHMENT"       { "MAIL " }
            default               { "?    " }
        }
        Write-Host "  $icon $($row.Date)  $($row.File)  [$($row.Status)]"
        if ($row.Path) { Write-Host "        -> $($row.Path)" -ForegroundColor DarkGray }
    }
}

$c = @{ new=0; upd=0; same=0; mail=0 }
$summary | ForEach-Object {
    switch ($_.Status) {
        "SAVED_NEW"           { $c.new++  }
        "OVERWRITTEN_UPDATED" { $c.upd++  }
        "ALREADY_EXISTS_SAME" { $c.same++ }
        "NO_ATTACHMENT"       { $c.mail++ }
    }
}

Write-Host "`nTotals:" -ForegroundColor Cyan
Write-Host "  New files saved    : $($c.new)"
Write-Host "  Updated (changed)  : $($c.upd)"
Write-Host "  Already up-to-date : $($c.same)"
Write-Host "  No attachment      : $($c.mail)"
Write-Host "`nDone." -ForegroundColor Green
