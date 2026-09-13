$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$templateCarrot = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Jul\GT Carrot July 2026.xlsm"
$templateOnion = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Jul\GT Onion July 2026.xlsm"

$augCarrot = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\GT Carrot August 2026.xlsm"
$augOnion = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\GT Onion August 2026.xlsm"

Write-Output "Generating August GT Schedules..."

# 1. Generate August Carrot GT (Starting seq 49)
# Dates: 01/08/2026, 04/08/2026, 08/08/2026, 11/08/2026, 15/08/2026, 18/08/2026, 22/08/2026, 25/08/2026, 29/08/2026
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

# Use first sheet as template
$templateSheetC = $wbC.Sheets.Item(1)

# Delete existing old date tabs except Tracker & _InternalData
$sheetsToKeep = @("Tracker", "_InternalData")
$allSheets = @()
foreach ($s in $wbC.Sheets) { $allSheets += $s }

# Keep one template sheet first
$tmpSheet = $templateSheetC

$seqC = 49
$newSheetsC = @()

foreach ($dt in $carrotDates) {
    $day = $dt.Day
    $month = $dt.Month
    $year = $dt.Year
    $tabName = "$day-$month-$year  ($seqC)"
    
    $gtDate = $dt.AddDays(-2)
    $reportNo = "CR-WP-01(1)-$seqC/69"
    $lotNo = "RCR$($year.ToString().Substring(2,2))$($month.ToString("D2"))$($day.ToString("D2"))"
    
    $newSheet = $tmpSheet.Copy([Type]::Missing, $wbC.Sheets.Item($wbC.Sheets.Count))
    $copiedSheet = $wbC.Sheets.Item($wbC.Sheets.Count)
    $copiedSheet.Name = $tabName
    
    # Set cells according to standard Yamamori GT template
    # A7 = Report No, B11 = Sample description, D11 = Weight (200g), D25 = Delivery Date, B25 = Lot, GT Date = C7 or appropriate header
    try {
        $copiedSheet.Range("A7").Value2 = "Report No. $reportNo"
        $copiedSheet.Range("B11").Value2 = "Carrot CR-WP-01(1)"
        $copiedSheet.Range("D11").Value2 = "200g"
        $copiedSheet.Range("D25").Value2 = $dt.ToString("dd/MM/yyyy")
        $copiedSheet.Range("B25").Value2 = $lotNo
    } catch {}
    
    Write-Output "Created Carrot Tab: $tabName (Seq $seqC, Deliv: $($dt.ToString('dd/MM/yyyy')))"
    $seqC++
}

# Delete old date tabs that were from July
foreach ($s in $allSheets) {
    if ($s.Name -notmatch 'Tracker|_InternalData') {
        try { $s.Delete() } catch {}
    }
}

$wbC.Save()
$wbC.Close()
Write-Output ">>> Saved: $augCarrot"


# 2. Generate August Onion GT (Starting seq 53)
# Dates: 01/08/2026, 04/08/2026, 05/08/2026, 08/08/2026, 11/08/2026, 15/08/2026, 18/08/2026, 22/08/2026, 25/08/2026, 29/08/2026
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
$allSheetsO = @()
foreach ($s in $wbO.Sheets) { $allSheetsO += $s }
$tmpSheetO = $templateSheetO

$seqO = 53

foreach ($dt in $onionDates) {
    $day = $dt.Day
    $month = $dt.Month
    $year = $dt.Year
    $tabName = "$day-$month-$year  ($seqO)"
    
    $gtDate = $dt.AddDays(-2)
    $reportNo = "ON-SP-01(2)-$seqO/69"
    $lotNo = "RON$($year.ToString().Substring(2,2))$($month.ToString("D2"))$($day.ToString("D2"))"
    
    $newSheet = $tmpSheetO.Copy([Type]::Missing, $wbO.Sheets.Item($wbO.Sheets.Count))
    $copiedSheet = $wbO.Sheets.Item($wbO.Sheets.Count)
    $copiedSheet.Name = $tabName
    
    try {
        $copiedSheet.Range("A7").Value2 = "Report No. $reportNo"
        $copiedSheet.Range("B11").Value2 = "Onion ON-SP-01(2)"
        $copiedSheet.Range("D11").Value2 = "200g"
        $copiedSheet.Range("D25").Value2 = $dt.ToString("dd/MM/yyyy")
        $copiedSheet.Range("B25").Value2 = $lotNo
    } catch {}
    
    Write-Output "Created Onion Tab: $tabName (Seq $seqO, Deliv: $($dt.ToString('dd/MM/yyyy')))"
    $seqO++
}

foreach ($s in $allSheetsO) {
    if ($s.Name -notmatch 'Tracker|_InternalData') {
        try { $s.Delete() } catch {}
    }
}

$wbO.Save()
$wbO.Close()
Write-Output ">>> Saved: $augOnion"

$excel.Quit()
