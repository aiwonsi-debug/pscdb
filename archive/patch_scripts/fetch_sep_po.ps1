$cfg = Get-Content "E:\agy\gmail_config.json" -Raw | ConvertFrom-Json
$email = $cfg.EmailAddress
$pass = $cfg.AppPassword.Replace(" ","").Trim()
$targetDir = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Sep"
if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }

$client = New-Object YamamoriSepDownloaderV2
try {
    $client.Connect("imap.gmail.com", 993) | Out-Null
    $client.Exec("LOGIN $email $pass") | Out-Null
    $client.Exec("SELECT INBOX") | Out-Null

    # Fetch Msg 750 (FW: 6908-2357,2358)
    Write-Output "Fetching Msg 750..."
    $rawBytes = $client.FetchFullMessage(750)
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
                    Write-Output "Found attachment: $filename"
                    if ($filename -match '\.pdf$') {
                        $contentIdx = $p.IndexOf("`r`n`r`n")
                        if ($contentIdx -ge 0) {
                            $b64 = ($p.Substring($contentIdx + 4).Trim()) -replace '\s+', ''
                            try {
                                $fileBytes = [System.Convert]::FromBase64String($b64)
                                $destPath = Join-Path $targetDir $filename
                                [System.IO.File]::WriteAllBytes($destPath, $fileBytes)
                                Write-Output ">>> SAVED: $destPath ($($fileBytes.Length) bytes)"
                            } catch {
                                Write-Output "Error: $_"
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
