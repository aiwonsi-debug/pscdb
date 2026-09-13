$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$augCarrot = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\GT Carrot August 2026.xlsm"
$augOnion = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\GT Onion August 2026.xlsm"

# Clean Carrot
$wbC = $excel.Workbooks.Open($augCarrot)
for ($i = $wbC.Sheets.Count; $i -ge 1; $i--) {
    $s = $wbC.Sheets.Item($i)
    if ($s.Name -eq "1-8-2026  (47)" -or $s.Name -eq "4-8-2026  (48)") {
        $s.Delete()
    }
}
$wbC.Save()
$wbC.Close()

# Clean Onion
$wbO = $excel.Workbooks.Open($augOnion)
for ($i = $wbO.Sheets.Count; $i -ge 1; $i--) {
    $s = $wbO.Sheets.Item($i)
    if ($s.Name -eq "1-8-2026  (51)" -or $s.Name -eq "4-8-2026  (52)") {
        $s.Delete()
    }
}
$wbO.Save()
$wbO.Close()

$excel.Quit()
