$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$templateCarrot = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Jul\GT Carrot July 2026.xlsm"
$templateOnion = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Jul\GT Onion July 2026.xlsm"

$augCarrot = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\GT Carrot August 2026.xlsm"
$augOnion = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\GT Onion August 2026.xlsm"

# 1. CARROT
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
    $dt = $carrotDates[$i]
    $day = $dt.Day
    $month = $dt.Month
    $year = $dt.Year
    $tabName = "$day-$month-$year  ($seqC)"
    
    $gtDate = $dt.AddDays(-2)
    $reportNo = "CR-WP-01(1)-$seqC/69"
    $lotNo = "RCR$($year.ToString().Substring(2,2))$($month.ToString("D2"))$($day.ToString("D2"))"
    
    $templateSheetC.Copy($templateSheetC)
    $targetSheet = $wbC.ActiveSheet
    $targetSheet.Name = $tabName
    
    try {
        $targetSheet.Range("A7").Value2 = "Report No. $reportNo"
        $targetSheet.Range("B11").Value2 = "Carrot CR-WP-01(1)"
        $targetSheet.Range("D11").Value2 = "200g"
        $targetSheet.Range("D25").Value2 = $dt.ToString("dd/MM/yyyy")
        $targetSheet.Range("B25").Value2 = $lotNo
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


# 2. ONION
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
    $dt = $onionDates[$i]
    $day = $dt.Day
    $month = $dt.Month
    $year = $dt.Year
    $tabName = "$day-$month-$year  ($seqO)"
    
    $gtDate = $dt.AddDays(-2)
    $reportNo = "ON-SP-01(2)-$seqO/69"
    $lotNo = "RON$($year.ToString().Substring(2,2))$($month.ToString("D2"))$($day.ToString("D2"))"
    
    $templateSheetO.Copy($templateSheetO)
    $targetSheet = $wbO.ActiveSheet
    $targetSheet.Name = $tabName
    
    try {
        $targetSheet.Range("A7").Value2 = "Report No. $reportNo"
        $targetSheet.Range("B11").Value2 = "Onion ON-SP-01(2)"
        $targetSheet.Range("D11").Value2 = "200g"
        $targetSheet.Range("D25").Value2 = $dt.ToString("dd/MM/yyyy")
        $targetSheet.Range("B25").Value2 = $lotNo
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
