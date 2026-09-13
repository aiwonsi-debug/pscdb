$cfg = Get-Content "E:\agy\gmail_config.json" -Raw | ConvertFrom-Json
$email = $cfg.EmailAddress
$pass = $cfg.AppPassword.Replace(" ","").Trim()
$targetDir = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Sep"

$client = New-Object DirectSepDownloader
try {
    $client.Connect("imap.gmail.com", 993) | Out-Null
    $client.Exec("LOGIN $email $pass") | Out-Null
    $client.Exec("SELECT INBOX") | Out-Null

    $mids = @(719, 725, 737, 738, 750)
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
                                        Write-Output ">>> SAVED: $filename ($($fileBytes.Length) bytes)"
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
