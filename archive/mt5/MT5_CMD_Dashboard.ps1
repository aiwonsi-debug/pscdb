$jsonPath = "$env:APPDATA\MetaQuotes\Terminal\Common\Files\mt5_dashboard.json"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "MT5 Professional Terminal Dashboard [v2.0]"

function Draw-Header {
    param($title)
    Write-Host "┌────────────────────────────────────────────────────────┐" -ForegroundColor DarkCyan
    Write-Host ("│  {0,-54}│" -f $title) -ForegroundColor Cyan
    Write-Host "├────────────────────────────────────────────────────────┤" -ForegroundColor DarkCyan
}

while ($true) {
    if (Test-Path $jsonPath) {
        try {
            $raw = Get-Content $jsonPath -Raw
            # Sanitize unquoted leverage e.g. "Leverage":1:2000 -> "Leverage":"1:2000"
            $cleaned = $raw -replace '"Leverage":1:(\d+)', '"Leverage":"1:$1"'
            $data = $cleaned | ConvertFrom-Json
            
            Clear-Host
            Draw-Header "MT5 TRADING ACCOUNT DASHBOARD"
            
            Write-Host ("│  Account: {0,-17} Login: {1,-18}│" -f $data.AccountName, $data.AccountNumber)
            Write-Host ("│  Server : {0,-17} Lev  : {1,-18}│" -f $data.Server, $data.Leverage)
            Write-Host "├──────────────────────────┬─────────────────────────────┤" -ForegroundColor DarkCyan
            
            $balStr = "{0:N2} {1}" -f $data.Balance, $data.Currency
            $eqStr  = "{0:N2} {1}" -f $data.Equity, $data.Currency
            $flStr  = "{0:N2} {1}" -f $data.FloatingProfit, $data.Currency
            
            Write-Host ("│  Balance : {0,-13}│  Equity    : {1,-14}│" -f $balStr, $eqStr)
            
            $pColor = if ($data.FloatingProfit -gt 0) { "Green" } elseif ($data.FloatingProfit -lt 0) { "Red" } else { "White" }
            Write-Host "│  Floating: " -NoNewline
            Write-Host ("{0,-14}" -f $flStr) -ForegroundColor $pColor -NoNewline
            Write-Host ("│  MarginLvl : {0,-14}│" -f ("{0:N2}%" -f $data.MarginLevel))
            
            Write-Host ("│  Free Mgn: {0,-13}│  Positions : {1,-14}│" -f ("{0:N2}" -f $data.MarginFree), ("{0} ({1:N2}L)" -f $data.OpenPositions, $data.TotalVolume))
            Write-Host "└──────────────────────────┴─────────────────────────────┘" -ForegroundColor DarkCyan
            
            if ($data.Positions -and $data.Positions.Count -gt 0) {
                Write-Host ""
                Write-Host " [ ACTIVE POSITIONS ]" -ForegroundColor Yellow
                Write-Host "┌────────────┬────────┬─────┬──────┬──────────┬──────────┬─────────┐" -ForegroundColor DarkGray
                Write-Host "│ Ticket     │ Sym    │ Dir │ Lots │ Open     │ Current  │ P/L     │" -ForegroundColor Gray
                Write-Host "├────────────┼────────┼─────┼──────┼──────────┼──────────┼─────────┤" -ForegroundColor DarkGray
                
                foreach ($p in $data.Positions) {
                    $dirColor = if ($p.type -eq "BUY") { "Cyan" } else { "Magenta" }
                    $plColor  = if ($p.profit -gt 0) { "Green" } elseif ($p.profit -lt 0) { "Red" } else { "White" }
                    
                    Write-Host ("│ {0,-10} │ {1,-6} │ " -f $p.ticket, $p.symbol) -NoNewline
                    Write-Host ("{0,-3}" -f $p.type) -ForegroundColor $dirColor -NoNewline
                    Write-Host (" │ {0,4:N2} │ {1,8:N2} │ {2,8:N2} │ " -f $p.lots, $p.open, $p.current) -NoNewline
                    Write-Host ("{0,7:N2}" -f $p.profit) -ForegroundColor $plColor -NoNewline
                    Write-Host " │"
                }
                Write-Host "└────────────┴────────┴─────┴──────┴──────────┴──────────┴─────────┘" -ForegroundColor DarkGray
            } else {
                Write-Host ""
                Write-Host "  ⚪ No Active Positions" -ForegroundColor DarkGray
            }
            
            Write-Host ""
            Write-Host " Last Sync: $(Get-Date -Format 'HH:mm:ss')  |  Press Ctrl+C to exit" -ForegroundColor DarkGray
            
        } catch {}
    } else {
        Clear-Host
        Write-Host "==========================================================" -ForegroundColor Yellow
        Write-Host " [WAITING] MetaTrader 5 EA Data File Not Found" -ForegroundColor Yellow
        Write-Host " Path: $jsonPath" -ForegroundColor DarkGray
        Write-Host " Please attach MT5_CMD_Dashboard_EA.mq5 to any MT5 chart." -ForegroundColor Cyan
        Write-Host "==========================================================" -ForegroundColor Yellow
    }
    Start-Sleep -Milliseconds 1000
}
