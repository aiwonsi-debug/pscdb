$pdfPath = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\2357 2358.pdf"
$bytes = [System.IO.File]::ReadAllBytes($pdfPath)
$text = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($bytes)

$streamMatches = [regex]::Matches($text, 'stream\r?\n')
foreach ($sm in $streamMatches) {
    $start = $sm.Index + $sm.Length
    $end = $text.IndexOf("endstream", $start)
    if ($end -gt $start) {
        $len = $end - $start
        # skip optional trailing CR/LF
        while ($len -gt 0 -and ($bytes[$start + $len - 1] -eq 10 -or $bytes[$start + $len - 1] -eq 13)) {
            $len--
        }
        
        try {
            # Skip zlib header (2 bytes: 0x78 0x9c etc)
            $ms = New-Object System.IO.MemoryStream($bytes, $start + 2, $len - 2)
            $ds = New-Object System.IO.Compression.DeflateStream($ms, [System.IO.Compression.CompressionMode]::Decompress)
            $outMs = New-Object System.IO.MemoryStream
            $ds.CopyTo($outMs)
            $decompText = [System.Text.Encoding]::UTF8.GetString($outMs.ToArray())
            
            # Print text chunks
            $tjMatches = [regex]::Matches($decompText, '\(([^()]+)\)\s*Tj')
            if ($tjMatches.Count -gt 0) {
                Write-Host "--- Stream Text ---" -ForegroundColor Cyan
                $fullStr = ($tjMatches | ForEach-Object { $_.Groups[1].Value }) -join " "
                Write-Host $fullStr
            }
        } catch {}
    }
}
