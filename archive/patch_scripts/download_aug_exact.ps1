$cfg = Get-Content "E:\agy\gmail_config.json" -Raw | ConvertFrom-Json
$email = $cfg.EmailAddress
$pass = $cfg.AppPassword.Replace(" ","").Trim()
$targetDir = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug"

$sourceCode = @"
using System;
using System.IO;
using System.Net.Sockets;
using System.Net.Security;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;

public class ExactAugDownloader : IDisposable {
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

$client = New-Object ExactAugDownloader
try {
    $client.Connect("imap.gmail.com", 993) | Out-Null
    $client.Exec("LOGIN $email $pass") | Out-Null
    $client.Exec("SELECT INBOX") | Out-Null

    $mids = @(578, 579, 581, 589, 611, 620, 638, 639, 649, 650, 652, 667, 696, 705, 709, 719, 725, 737, 738, 750)
    foreach ($mid in $mids) {
        $rawBytes = $client.FetchFullMessage($mid)
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
                        if ($filename -match '\.pdf$' -and $filename -match '^\d+') {
                            $contentIdx = $p.IndexOf("`r`n`r`n")
                            if ($contentIdx -ge 0) {
                                $b64 = ($p.Substring($contentIdx + 4).Trim()) -replace '\s+', ''
                                try {
                                    $fileBytes = [System.Convert]::FromBase64String($b64)
                                    if ($fileBytes.Length -gt 1000) {
                                        $destPath = Join-Path $targetDir $filename
                                        [System.IO.File]::WriteAllBytes($destPath, $fileBytes)
                                        Write-Output ">>> [DOWNLOADED] $filename ($($fileBytes.Length) bytes)"
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
finally {
    $client.Dispose()
}
