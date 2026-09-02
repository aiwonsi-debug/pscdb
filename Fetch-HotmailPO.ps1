<#
.SYNOPSIS
    Smart Multi-Customer Hotmail / Outlook.com PO & Order Fetcher for TNS, AFT, Siam Yamamori, and Oishi.
    Connects to Microsoft Exchange / Outlook IMAP (outlook.office365.com:993).
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
if ([string]::IsNullOrWhiteSpace($ConfigFile)) { $ConfigFile = Join-Path $AgyBaseDir "hotmail_config.json" }
if ([string]::IsNullOrWhiteSpace($BaseWorkDir)) { $BaseWorkDir = Join-Path (Split-Path $AgyBaseDir -Parent) "งาน 25-26" }

$registryFile = Join-Path $AgyBaseDir "downloaded_po_registry.json"

# Load persistent download registry
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
    Write-Error "Hotmail credentials not found in $ConfigFile. Please provide EmailAddress and AppPassword."
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

public class FastHotmailImapAgyV1 : IDisposable {
    private TcpClient tcp;
    private SslStream ssl;
    private int tagCounter = 0;

    public bool Connect(string host = "outlook.office365.com", int port = 993) {
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

    public string SelectFolder(string folder = "INBOX") {
        return Exec("SELECT \"" + folder + "\"");
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
        return Exec("FETCH " + id + " (ENVELOPE BODYSTRUCTURE)");
    }

    public byte[] FetchBody(int id) {
        tagCounter++;
        string tag = "A" + tagCounter.ToString("D4");
        byte[] cmdBytes = Encoding.ASCII.GetBytes(tag + " FETCH " + id + " BODY.PEEK[]\r\n");
        ssl.Write(cmdBytes);
        ssl.Flush();

        MemoryStream ms = new MemoryStream();
        byte[] buffer = new byte[8192];
        int bytesRead;
        string endTag = "\r\n" + tag + " OK";
        byte[] endTagBytes = Encoding.ASCII.GetBytes(endTag);

        while ((bytesRead = ssl.Read(buffer, 0, buffer.Length)) > 0) {
            ms.Write(buffer, 0, bytesRead);
            byte[] current = ms.ToArray();
            if (SearchBytes(current, endTagBytes) != -1 || Encoding.ASCII.GetString(current).Contains(tag + " OK")) {
                break;
            }
        }
        return ms.ToArray();
    }

    private int SearchBytes(byte[] src, byte[] pattern) {
        int max = src.Length - pattern.Length;
        for (int i = 0; i <= max; i++) {
            bool match = true;
            for (int j = 0; j < pattern.Length; j++) {
                if (src[i + j] != pattern[j]) { match = false; break; }
            }
            if (match) return i;
        }
        return -1;
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

if (-not ([System.Management.Automation.PSTypeName]'FastHotmailImapAgyV1').Type) {
    Add-Type -TypeDefinition $sourceCode
}

$client = New-Object FastHotmailImapAgyV1
try {
    Write-Host "Connecting to Hotmail / Outlook (outlook.office365.com:993)..." -ForegroundColor Cyan
    $connected = $client.Connect("outlook.office365.com", 993)
    if (-not $connected) { Write-Error "Failed to connect to outlook.office365.com"; exit 1 }

    Write-Host "Logging in as $EmailAddress..." -ForegroundColor Cyan
    $loggedIn = $client.Login($EmailAddress, $AppPassword)
    if (-not $loggedIn) { Write-Error "Invalid Hotmail credentials or App Password required!"; exit 1 }

    Write-Host "Connected and Authenticated successfully!" -ForegroundColor Green
    $client.SelectFolder("INBOX") | Out-Null
    $ids = $client.Search('ALL')
    
    $recentIds = $ids | Select-Object -Last 50
    Write-Host "Total messages in INBOX: $($ids.Count). Scanning last 50..." -ForegroundColor Yellow
    
    $downloadedFiles = @()
    foreach ($id in $recentIds) {
        $env = $client.FetchEnvelope($id)
        if ($env -match '(?i)(PO|Order|ใบสั่งซื้อ|nisshin|tns|aft|ajinomoto|yamamori|oishi|purchasing\s*plan|\d{4}-\d{4})') {
            # Email matched
            Write-Host "Found matching email ID: $id" -ForegroundColor Green
        }
    }
    
    Write-Host "Hotmail scan finished successfully." -ForegroundColor Green
} finally {
    $client.Dispose()
}
