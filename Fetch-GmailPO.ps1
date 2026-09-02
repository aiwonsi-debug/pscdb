<#
.SYNOPSIS
    Smart Multi-Customer Gmail PO & Order Fetcher for TNS, AFT, Siam Yamamori, and Oishi.
    Includes persistent registry to completely eliminate duplicate downloads and repetitive alerts.
#>
param (
    [string]$ConfigFile = "",
    [string]$AgyBaseDir = "",
    [string]$BaseWorkDir = "",
    [string]$EmailAddress = "",
    [string]$AppPassword = "",
    [switch]$AutoProcessGT
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($AgyBaseDir)) { $AgyBaseDir = $PSScriptRoot }
if ([string]::IsNullOrWhiteSpace($ConfigFile)) { $ConfigFile = Join-Path $AgyBaseDir "gmail_config.json" }
if ([string]::IsNullOrWhiteSpace($BaseWorkDir)) { $BaseWorkDir = Join-Path (Split-Path $AgyBaseDir -Parent) "งาน 25-26" }

$registryFile = Join-Path $AgyBaseDir "downloaded_po_registry.json"

# Load persistent download registry (PowerShell 5.1 Compatible)
$registry = @{}
if (Test-Path $registryFile) {
    try {
        $jsonObj = Get-Content $registryFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($jsonObj) {
            foreach ($prop in $jsonObj.PSObject.Properties) {
                $registry[$prop.Name] = $prop.Value
            }
        }
    } catch {}
}

if (Test-Path $ConfigFile) {
    try {
        $cfg = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $EmailAddress -and $cfg.EmailAddress) { $EmailAddress = $cfg.EmailAddress }
        if (-not $AppPassword -and $cfg.AppPassword) { $AppPassword = $cfg.AppPassword }
    } catch {}
}

if ([string]::IsNullOrWhiteSpace($EmailAddress) -or [string]::IsNullOrWhiteSpace($AppPassword)) {
    Write-Error "Gmail credentials not found in $ConfigFile"
    exit 1
}

$AppPassword = $AppPassword.Replace(" ", "").Trim()

$sourceCode = @"
using System;
using System.IO;
using System.Net.Sockets;
using System.Net.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

public class FastGmailImapAgyV7 : IDisposable {
    private TcpClient tcp;
    private SslStream ssl;
    private int tagCounter = 0;

    public bool Connect(string host = "imap.gmail.com", int port = 993) {
        tcp = new TcpClient();
        tcp.ReceiveTimeout = 15000;
        tcp.SendTimeout = 15000;
        tcp.Connect(host, port);
        ssl = new SslStream(tcp.GetStream(), false);
        ssl.ReadTimeout = 15000;
        ssl.WriteTimeout = 15000;
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
        tagCounter++;
        string tag = "A" + tagCounter.ToString("D4");
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

if (-not ([System.Management.Automation.PSTypeName]'FastGmailImapAgyV7').Type) {
    Add-Type -TypeDefinition $sourceCode
}

$client = New-Object FastGmailImapAgyV7
try {
    $connected = $client.Connect("imap.gmail.com", 993)
    if (-not $connected) { Write-Error "Failed to connect to imap.gmail.com"; exit 1 }

    $loggedIn = $client.Login($EmailAddress, $AppPassword)
    if (-not $loggedIn) { Write-Error "Invalid credentials!"; exit 1 }

    $client.SelectFolder("INBOX") | Out-Null
    $ids = $client.Search('ALL')
    
    # Check last 50 emails
    $recentIds = $ids | Select-Object -Last 50
    $downloadedFiles = @()
    $monthNames = @("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    
    foreach ($id in $recentIds) {
        $env = $client.FetchEnvelope($id)
        
        # Match TNS, AFT, Siam Yamamori, Oishi, PO, Order, Purchasing Plan
        if ($env -match '(?i)(PO|Order|ใบสั่งซื้อ|nisshin|tns|aft|ajinomoto|yamamori|oishi|purchasing\s*plan|\d{4}-\d{4})') {
            $subjMatch = [regex]::Match($env, 'Subject:\s*([^\r\n]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            $fromMatch = [regex]::Match($env, 'From:\s*([^\r\n]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            $dateMatch = [regex]::Match($env, 'Date:\s*([^\r\n]+)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            
            $subject = if ($subjMatch.Success) { $subjMatch.Groups[1].Value.Trim() } else { "Order Email" }
            $from = if ($fromMatch.Success) { $fromMatch.Groups[1].Value.Trim() } else { "" }
            
            $msgDate = [DateTime]::Now
            if ($dateMatch.Success) { try { $msgDate = [DateTime]::Parse($dateMatch.Groups[1].Value) } catch {} }
            $targetMonth = $monthNames[$msgDate.Month - 1]
            $targetYear = $msgDate.Year.ToString()
            
            # Determine Customer destination folder
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
            
            if ($boundaryMatch.Success) {
                $boundary = $boundaryMatch.Groups[1].Value.Trim()
                $parts = $rawText -split [regex]::Escape("--" + $boundary)
                
                foreach ($p in $parts) {
                    $fnMatch = [regex]::Match($p, 'filename="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                    if ($fnMatch.Success) {
                        $filename = $fnMatch.Groups[1].Value.Trim('"').Trim()
                        if ($filename -match '\.(pdf|xlsx|xls|csv|zip)$' -and $filename -notmatch '(?i)\.(png|jpg|jpeg|gif)$') {
                            
                            # Classification
                            $isPO = $true
                            $docType = "PO"
                            $destDir = ""
                            
                            if ($filename -match '^(?i)(GT[\s_-]|Good\s*Transportation)') {
                                $isPO = $false
                                $docType = "GT"
                                $destDir = Join-Path (Join-Path $BaseWorkDir "AFT") "GT"
                            } elseif ($filename -match '^(?i)(Record[\s_-]|บันทึกเพาะปลูก|CB-SM)') {
                                $isPO = $false
                                $docType = "Record"
                                $destDir = Join-Path (Join-Path (Join-Path $BaseWorkDir "AFT") "บันทึกเพาะปลูกกะหล่ำปลี") "$targetYear(4)"
                            } elseif ($filename -match '^(?i)(COA[\s_-]|Audit|Certificate)') {
                                $isPO = $false
                                $docType = "COA"
                                $destDir = Join-Path (Join-Path $BaseWorkDir "AFT") "COA"
                            } else {
                                # Genuine PO / Order
                                if ($filename -match '(?i)Order\s*PSC\.xlsx') { $customerName = "TNS" }
                                
                                $destDir = if ($customerName -eq "AFT" -or $customerName -eq "TNS") {
                                    Join-Path (Join-Path (Join-Path (Join-Path $BaseWorkDir $customerName) "PO") $targetYear) $targetMonth
                                } else {
                                    Join-Path (Join-Path (Join-Path $BaseWorkDir $customerName) "PO") $targetMonth
                                }
                            }
                            
                            # Extract base64 content
                            $contentIdx = $p.IndexOf("`r`n`r`n")
                            if ($contentIdx -ge 0) {
                                $b64 = ($p.Substring($contentIdx + 4).Trim()) -replace '\s+', ''
                                try {
                                    $fileBytes = [System.Convert]::FromBase64String($b64)
                                    $uniqueKey = "$customerName`_$filename`_$($fileBytes.Length)"
                                    
                                    # Check if already processed in registry
                                    if (-not $registry.ContainsKey($uniqueKey)) {
                                        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
                                        $destPath = Join-Path $destDir $filename
                                        
                                        [System.IO.File]::WriteAllBytes($destPath, $fileBytes)
                                        $registry[$uniqueKey] = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
                                        
                                        if ($isPO) {
                                            Write-Output "[SAVED] $customerName : $filename -> $targetMonth/$targetYear ($($fileBytes.Length) bytes)"
                                            $downloadedFiles += $destPath
                                        } else {
                                            Write-Output "[$($docType)_SAVED] $customerName : $filename ($($fileBytes.Length) bytes)"
                                        }
                                    }
                                } catch {}
                            }
                        }
                    }
                }
            }
        }
    }
    
    # Save updated registry
    try {
        $registry | ConvertTo-Json | Set-Content -Path $registryFile -Encoding UTF8
    } catch {}

    if ($downloadedFiles.Count -gt 0) {
        Write-Output "[TOTAL_NEW_FILES] $($downloadedFiles.Count)"
    } else {
        Write-Output "[NO_NEW_FILES]"
    }
}
finally {
    $client.Dispose()
}