$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$targetExcel = "E:\รวมงาน\งาน 25-26\Siam Yamamori\PO\Aug\Siam_Yamamori_August_2026_Order_Summary.xlsx"

$wb = $excel.Workbooks.Add()
$ws = $wb.Sheets.Item(1)
$ws.Name = "Aug 2026 Summary"

# Title Header
$ws.Range("A1:G1").Merge()
$ws.Range("A1").Value2 = "📊 สรุปรายการคำสั่งซื้อ Siam Yamamori ประจำเดือนสิงหาคม 2569 (August 2026)"
$ws.Range("A1").Font.Size = 14
$ws.Range("A1").Font.Bold = $true
$ws.Range("A1").Font.Color = 0xFFFFFF
$ws.Range("A1").Interior.Color = 0x804000 # Dark Blue / Brown
$ws.Range("A1").HorizontalAlignment = -4108 # Center
$ws.Range("A1").RowHeight = 35

# Subtitle
$ws.Range("A2:G2").Merge()
$ws.Range("A2").Value2 = "อ้างอิงข้อมูลจากไฟล์ PO จริงในโฟลเดอร์ Siam Yamamori/PO/Aug พร้อมรหัส Lot และหมายเลขลำดับ GT Delivery Schedule"
$ws.Range("A2").Font.Size = 10
$ws.Range("A2").Font.Italic = $true
$ws.Range("A2").Interior.Color = 0xF2EFEB
$ws.Range("A2").HorizontalAlignment = -4108
$ws.Range("A2").RowHeight = 20

# Column Headers
$headers = @(
    "ลำดับ",
    "กำหนดส่งมอบ (D25)",
    "วันตรวจ GT (D12)",
    "สินค้า (Product)",
    "รายละเอียด PO",
    "Lot Number (B25)",
    "เลขลำดับ GT (Seq)"
)

for ($c = 1; $c -le $headers.Count; $c++) {
    $cell = $ws.Cells.Item(4, $c)
    $cell.Value2 = $headers[$c - 1]
    $cell.Font.Bold = $true
    $cell.Font.Size = 11
    $cell.Font.Color = 0xFFFFFF
    $cell.Interior.Color = 0x595959 # Slate Gray
    $cell.HorizontalAlignment = -4108
    $cell.VerticalAlignment = -4108
}
$ws.Range("A4:G4").RowHeight = 26

# Data Rows
$data = @(
    @("1", "01/08/2026", "31/07/2026", "🥕 แครอท (Carrot)", "PO6907-2078", "RCR260731-01", "Carrot (49)"),
    @("2", "01/08/2026", "31/07/2026", "🧅 หอมใหญ่ (Onion)", "PO6907-2078", "RON260731-01", "Onion (53)"),
    @("3", "04/08/2026", "03/08/2026", "🥕 แครอท (Carrot)", "PO6907-2079", "RCR260803-01", "Carrot (50)"),
    @("4", "04/08/2026", "03/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6907-2079", "RON260803-01", "Onion (54)"),
    @("5", "05/08/2026", "04/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6907-2080", "RON260804-01", "Onion (55)"),
    @("6", "08/08/2026", "07/08/2026", "🥕 แครอท (Carrot)", "PO6907-2081", "RCR260807-01", "Carrot (51)"),
    @("7", "08/08/2026", "07/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6907-2081", "RON260807-01", "Onion (56)"),
    @("8", "11/08/2026", "10/08/2026", "🥕 แครอท (Carrot)", "PO6907-2131", "RCR260810-01", "Carrot (52)"),
    @("9", "11/08/2026", "10/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6907-2131", "RON260810-01", "Onion (57)"),
    @("10", "15/08/2026", "14/08/2026", "🥕 แครอท (Carrot)", "PO6907-2175", "RCR260814-01", "Carrot (53)"),
    @("11", "15/08/2026", "14/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6907-2175", "RON260814-01", "Onion (58)"),
    @("12", "18/08/2026", "17/08/2026", "🥕 แครอท (Carrot)", "PO6907-2176", "RCR260817-01", "Carrot (54)"),
    @("13", "18/08/2026", "17/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6907-2176", "RON260817-01", "Onion (59)"),
    @("14", "22/08/2026", "21/08/2026", "🥕 แครอท (Carrot)", "PO6908-2224", "RCR260821-01", "Carrot (55)"),
    @("15", "22/08/2026", "21/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6908-2224", "RON260821-01", "Onion (60)"),
    @("16", "25/08/2026", "24/08/2026", "🥕 แครอท (Carrot)", "PO6908-2225", "RCR260824-01", "Carrot (56)"),
    @("17", "25/08/2026", "24/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6908-2225", "RON260824-01", "Onion (61)"),
    @("18", "29/08/2026", "28/08/2026", "🥕 แครอท (Carrot)", "PO6908-2226 / 2282", "RCR260828-01", "Carrot (57)"),
    @("19", "29/08/2026", "28/08/2026", "🧅 หอมใหญ่ (Onion)", "PO6908-2226 / 2282", "RON260828-01", "Onion (62)")
)

$startRow = 5
for ($r = 0; $r -lt $data.Count; $r++) {
    $currentRow = $startRow + $r
    $rowItems = $data[$r]
    
    $ws.Cells.Item($currentRow, 1).Value2 = [int]$rowItems[0]
    $ws.Cells.Item($currentRow, 2).Value2 = $rowItems[1]
    $ws.Cells.Item($currentRow, 3).Value2 = $rowItems[2]
    $ws.Cells.Item($currentRow, 4).Value2 = $rowItems[3]
    $ws.Cells.Item($currentRow, 5).Value2 = $rowItems[4]
    $ws.Cells.Item($currentRow, 6).Value2 = $rowItems[5]
    $ws.Cells.Item($currentRow, 7).Value2 = $rowItems[6]
    
    # Zebra striping
    if ($r % 2 -eq 1) {
        $ws.Range("A$currentRow:G$currentRow").Interior.Color = 0xF9F9F9
    }
    
    # Alignments
    $ws.Range("A$currentRow").HorizontalAlignment = -4108 # Center
    $ws.Range("B$currentRow:C$currentRow").HorizontalAlignment = -4108 # Center
    $ws.Range("E$currentRow:G$currentRow").HorizontalAlignment = -4108 # Center
    
    # Carrot / Onion subtle coloring
    if ($rowItems[3] -like "*แครอท*") {
        $ws.Range("D$currentRow").Font.Color = 0x0055D9 # Orange/Brownish
    } else {
        $ws.Range("D$currentRow").Font.Color = 0x664400 # Deep Blue/Cyan
    }
    
    $ws.Range("A$currentRow:G$currentRow").RowHeight = 22
}

$endRow = $startRow + $data.Count - 1

# Borders
$tableRange = $ws.Range("A4:G$endRow")
$tableRange.Borders.LineStyle = 1 # xlContinuous
$tableRange.Borders.Weight = 2 # xlThin
$tableRange.Borders.Color = 0xD9D9D9

# Auto-fit Columns with padding
$ws.Columns.Item(1).ColumnWidth = 8   # ลำดับ
$ws.Columns.Item(2).ColumnWidth = 20  # กำหนดส่งมอบ
$ws.Columns.Item(3).ColumnWidth = 18  # วันตรวจ GT
$ws.Columns.Item(4).ColumnWidth = 22  # สินค้า
$ws.Columns.Item(5).ColumnWidth = 24  # รายละเอียด PO
$ws.Columns.Item(6).ColumnWidth = 20  # Lot Number
$ws.Columns.Item(7).ColumnWidth = 20  # เลขลำดับ GT

# Freeze Panes
$ws.Range("A5").Select()
$excel.ActiveWindow.FreezePanes = $true

$wb.SaveAs($targetExcel)
$wb.Close()
$excel.Quit()

Write-Output "Successfully generated: $targetExcel"
