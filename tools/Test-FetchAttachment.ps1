# Test downloading attachments from email ID 745
$rawMsg = $client.FetchFullMessage(745)
Write-Host "Fetched Message 745 size: $($rawMsg.Length) bytes" -ForegroundColor Green

# Parse MIME parts
$rawText = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($rawMsg)

# Find boundary
$boundaryMatch = [regex]::Match($rawText, 'boundary="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if ($boundaryMatch.Success) {
    $boundary = $boundaryMatch.Groups[1].Value.Trim()
    Write-Host "Boundary found: $boundary" -ForegroundColor Cyan
    $parts = $rawText -split [regex]::Escape("--" + $boundary)
    Write-Host "Total parts: $($parts.Length)"
    
    foreach ($p in $parts) {
        $fnMatch = [regex]::Match($p, 'filename="?([^"\r\n;]+)"?', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($fnMatch.Success) {
            $filename = $fnMatch.Groups[1].Value
            Write-Host "Found attachment: $filename" -ForegroundColor Yellow
            
            # Extract content after double CRLF
            $contentIdx = $p.IndexOf("`r`n`r`n")
            if ($contentIdx -ge 0) {
                $b64 = $p.Substring($contentIdx + 4).Trim()
                # Clean base64
                $b64Clean = $b64 -replace '\s+', ''
                try {
                    $bytes = [System.Convert]::FromBase64String($b64Clean)
                    Write-Host "Decoded PDF successfully! Size: $($bytes.Length) bytes" -ForegroundColor Green
                    
                    # Save to PO/Sep folder
                    $sepDir = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Sep"
                    if (-not (Test-Path $sepDir)) { New-Item -ItemType Directory -Path $sepDir -Force | Out-Null }
                    $savePath = Join-Path $sepDir $filename
                    [System.IO.File]::WriteAllBytes($savePath, $bytes)
                    Write-Host "Saved attachment to: $savePath" -ForegroundColor Cyan
                } catch {
                    Write-Warning "Base64 decode error: $_"
                }
            }
        }
    }
}
