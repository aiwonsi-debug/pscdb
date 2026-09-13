$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$templateCarrot = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Jul\GT Carrot July 2026.xlsm"
$templateOnion = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Jul\GT Onion July 2026.xlsm"

$augCarrot = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\GT Carrot August 2026.xlsm"
$augOnion = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\GT Onion August 2026.xlsm"

# =========================================================================
# 1. CARROT (August 2026)
# =========================================================================
$carrotDates = @(
    [DateTime]::ParseExact("01/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("04/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("08/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("11/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("15/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("18/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("22/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("25/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("29/08/2026", "dd/MM/yyyy", $null)
)

Copy-Item $templateCarrot $augCarrot -Force
$wbC = $excel.Workbooks.Open($augCarrot)
$templateSheetC = $wbC.Sheets.Item(1)

$seqC = 49
for ($i = 0; $i -lt $carrotDates.Count; $i++) {
    $d25_dt = $carrotDates[$i]           # Delivery date (D25)
    $d12_dt = $d25_dt.AddDays(-1)        # 1 day before D25 (D12)
    $b12_dt = $d12_dt.AddDays(-1)        # 1 day before D12 (B12)
    
    $tabName = "$($d25_dt.Day)-$($d25_dt.Month)-$($d25_dt.Year)  ($seqC)"
    $reportNo = "Report No : GT 69/$seqC"
    
    # Lot No in B25 based on D12 date (YYMMDD-01)
    $lotNo = "RCR$($d12_dt.ToString('yyMMdd'))-01"
    
    $templateSheetC.Copy($templateSheetC)
    $targetSheet = $wbC.ActiveSheet
    $targetSheet.Name = $tabName
    
    try {
        $targetSheet.Range("A7").Value2 = $reportNo
        $targetSheet.Range("B11").Value2 = "Carrot CR-WP-01(1)"
        $targetSheet.Range("D11").Value2 = "200g"
        
        # B12: 1 day before D12
        $targetSheet.Range("B12").Value2 = $b12_dt.ToString("d-MMM-yy", [System.Globalization.CultureInfo]::InvariantCulture)
        
        # D12: 1 day before D25
        $targetSheet.Range("D12").Value2 = $d12_dt.ToString("d-MMM-yy", [System.Globalization.CultureInfo]::InvariantCulture)
        
        # B25: Lot based on D12 date
        $targetSheet.Range("B25").Value2 = $lotNo
        
        # D25: Delivery date
        $targetSheet.Range("D25").Value2 = "$($d25_dt.Day)/$($d25_dt.Month)/$($d25_dt.Year)"
    } catch {}
    
    $seqC++
}

# Delete all old July sheets
for ($i = $wbC.Sheets.Count; $i -ge 1; $i--) {
    $s = $wbC.Sheets.Item($i)
    if ($s.Name -match '-7-2026') {
        $s.Delete()
    }
}

$wbC.Save()
$wbC.Close()


# =========================================================================
# 2. ONION (August 2026)
# =========================================================================
$onionDates = @(
    [DateTime]::ParseExact("01/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("04/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("05/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("08/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("11/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("15/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("18/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("22/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("25/08/2026", "dd/MM/yyyy", $null),
    [DateTime]::ParseExact("29/08/2026", "dd/MM/yyyy", $null)
)

Copy-Item $templateOnion $augOnion -Force
$wbO = $excel.Workbooks.Open($augOnion)
$templateSheetO = $wbO.Sheets.Item(1)

$seqO = 53
for ($i = 0; $i -lt $onionDates.Count; $i++) {
    $d25_dt = $onionDates[$i]          # Delivery date (D25)
    $d12_dt = $d25_dt.AddDays(-1)       # 1 day before D25 (D12)
    $b12_dt = $d12_dt.AddDays(-1)       # 1 day before D12 (B12)
    
    $tabName = "$($d25_dt.Day)-$($d25_dt.Month)-$($d25_dt.Year)  ($seqO)"
    $reportNo = "Report No : GT 69/$seqO"
    
    # Lot No in B25 based on D12 date (YYMMDD-01)
    $lotNo = "RON$($d12_dt.ToString('yyMMdd'))-01"
    
    $templateSheetO.Copy($templateSheetO)
    $targetSheetO = $wbO.ActiveSheet
    $targetSheetO.Name = $tabName
    
    try {
        $targetSheetO.Range("A7").Value2 = $reportNo
        $targetSheetO.Range("B11").Value2 = "Onion ON-SP-01(2)"
        $targetSheetO.Range("D11").Value2 = "200g"
        
        # B12: 1 day before D12
        $targetSheetO.Range("B12").Value2 = $b12_dt.ToString("d-MMM-yy", [System.Globalization.CultureInfo]::InvariantCulture)
        
        # D12: 1 day before D25
        $targetSheetO.Range("D12").Value2 = $d12_dt.ToString("d-MMM-yy", [System.Globalization.CultureInfo]::InvariantCulture)
        
        # B25: Lot based on D12 date
        $targetSheetO.Range("B25").Value2 = $lotNo
        
        # D25: Delivery date
        $targetSheetO.Range("D25").Value2 = "$($d25_dt.Day)/$($d25_dt.Month)/$($d25_dt.Year)"
    } catch {}
    
    $seqO++
}

for ($i = $wbO.Sheets.Count; $i -ge 1; $i--) {
    $s = $wbO.Sheets.Item($i)
    if ($s.Name -match '-7-2026') {
        $s.Delete()
    }
}

$wbO.Save()
$wbO.Close()

$excel.Quit()
Write-Output "Successfully updated D12, B12, B25, D25 according to exact rules!"
