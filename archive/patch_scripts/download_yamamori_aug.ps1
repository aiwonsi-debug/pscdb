$cfg = Get-Content "E:\agy\gmail_config.json" -Raw | ConvertFrom-Json
$email = $cfg.EmailAddress
$pass = $cfg.AppPassword.Replace(" ","").Trim()
$targetDir = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug"
if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }

$sourceCode = @"
using System;
using System.IO;
using System.Net.Sockets;
using System.Net.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

public class FastYamamoriDownloader : IDisposable {
    private TcpClient tcp;
    private SslStream ssl;
    private int tagCounter = 0;

    public bool Connect(string host = "imap.gmail.com", int port = 993) {
        tcp = new TcpClient();
        tcp.ReceiveTimeout = 60000;
        tcp.SendTimeout = 60000;
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

    public byte[] FetchFullMessage(int id) {
        tagCounter++;
        string tag = "A" + tagCounter.ToString("D4");
        byte[] cmdBytes = Encoding.ASCII.GetBytes(tag + " FETCH " + id + " BODY.PEEK[]\r\n");
        ssl.Write(cmdBytes);
        ssl.Flush();

        string line = ReadLine();
        if (line == null || (!line.Contains("BODY[]") && !line.Contains("BODY.PEEK[]") && !line.Contains("FETCH"))) return new byte[0];

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

Add-Type -TypeDefinition $sourceCode -ErrorAction SilentlyContinue

$client = New-Object FastYamamoriDownloader
try {
    $client.Connect("imap.gmail.com", 993) | Out-Null
    $client.Exec("LOGIN $email $pass") | Out-Null
    $client.Exec("SELECT INBOX") | Out-Null

    $searchRes = $client.Exec('SEARCH SINCE 15-Jul-2026 BEFORE 01-Sep-2026')
    $msgIds = @()
    foreach ($line in ($searchRes -split "`r?`n")) {
        if ($line -match '^\*\s+SEARCH\s+(.+)$') {
            $msgIds += ($matches[1] -split '\s+')
        }
    }

    Write-Output "Found $($msgIds.Count) messages. Downloading Yamamori PO files..."

    foreach ($mid in $msgIds) {
        if ([string]::IsNullOrWhiteSpace($mid)) { continue }
        $header = $client.Exec("FETCH $mid (BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE)])")
        
        if ($header -match '6907' -or $header -match '6908' -or $header -match 'PO' -or $header -match 'Yamamori' -or $header -match 'FW:\s*\d+' -or $header -match 'FW:\s*\[\s*\d+' -or $header -match '1950' -or $header -match '2078' -or $header -match '2101' -or $header -match '2160' -or $header -match '2245' -or $header -match '2280' -or $header -match '2357' -or $header -match '2358') {
            $rawBytes = $client.FetchFullMessage([int]$mid)
            if ($rawBytes.Length -gt 0) {
                $rawText = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($rawBytes)
                $boundaryMatch = [regex]::Match($rawText, 'boundary="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                
                if ($boundaryMatch.Success) {
                    $boundary = $boundaryMatch.Groups[1].Value.Trim()
                    $parts = $rawText -split [regex]::Escape("--" + $boundary)
                    
                    foreach ($p in $parts) {
                        $fnMatch = [regex]::Match($p, 'filename="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                        if ($fnMatch.Success) {
                            $filename = $fnMatch.Groups[1].Value.Trim('"').Trim()
                            $filename = [regex]::Replace($filename, '=\?utf-8\?B\?([^\?]+)\?=', { param($m) [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($m.Groups[1].Value)) })
                            
                            # Filter for Yamamori POs: filenames starting with numbers (e.g. 1950.pdf, 2078-2081.pdf, etc.)
                            if ($filename -match '^\d+.*\.pdf$' -or $filename -match '^PO\d+.*\.pdf$') {
                                $contentIdx = $p.IndexOf("`r`n`r`n")
                                if ($contentIdx -ge 0) {
                                    $b64 = ($p.Substring($contentIdx + 4).Trim()) -replace '\s+', ''
                                    try {
                                        $fileBytes = [System.Convert]::FromBase64String($b64)
                                        if ($fileBytes.Length -gt 1000) {
                                            $destPath = Join-Path $targetDir $filename
                                            [System.IO.File]::WriteAllBytes($destPath, $fileBytes)
                                            Write-Output ">>> [DOWNLOADED] $filename -> Aug/ ($($fileBytes.Length) bytes)"
                                        }
                                    } catch {}
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
finally {
    $client.Dispose()
}
