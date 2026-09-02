function Calculate-CabbageRunwayWithLeadTime {
    param(
        [double]$TotalStock28Aug = 16843.94,
        [double]$YieldAFT = 0.60,
        [double]$YieldTNS = 0.99
    )
    
    $schedule = @(
        @{ DeliveryDate="28/08/2569"; PrepDate="28/08/2569"; Customer="TNS"; FinishedKg=600.0;  Yield=$YieldTNS; Note="ส่ง TNS" },
        @{ DeliveryDate="29/08/2569"; PrepDate="29/08/2569"; Customer="TNS"; FinishedKg=600.0;  Yield=$YieldTNS; Note="ส่ง TNS" },
        @{ DeliveryDate="01/09/2569"; PrepDate="30-31/08/69"; Customer="AFT"; FinishedKg=2500.0; Yield=$YieldAFT; Note="เตรียมล่วงหน้า 1-2 วัน" },
        @{ DeliveryDate="03/09/2569"; PrepDate="01-02/09/69"; Customer="AFT"; FinishedKg=3000.0; Yield=$YieldAFT; Note="เตรียมล่วงหน้า 1-2 วัน" },
        @{ DeliveryDate="05/09/2569"; PrepDate="03-04/09/69"; Customer="AFT"; FinishedKg=2000.0; Yield=$YieldAFT; Note="เตรียมล่วงหน้า 1-2 วัน" },
        @{ DeliveryDate="07/09/2569"; PrepDate="05-06/09/69"; Customer="AFT"; FinishedKg=2500.0; Yield=$YieldAFT; Note="เตรียมล่วงหน้า 1-2 วัน (ขาดวัตถุดิบ!)" },
        @{ DeliveryDate="08/09/2569"; PrepDate="06-07/09/69"; Customer="AFT"; FinishedKg=2500.0; Yield=$YieldAFT; Note="เตรียมล่วงหน้า 1-2 วัน" },
        @{ DeliveryDate="10/09/2569"; PrepDate="08-09/09/69"; Customer="AFT"; FinishedKg=2000.0; Yield=$YieldAFT; Note="เตรียมล่วงหน้า 1-2 วัน" }
    )
    
    $stock = $TotalStock28Aug
    Write-Host "===================================================================================================="
    Write-Host "  คำนวณแผนการผลิตและตัดสต็อกกะหล่ำปลี (AFT Lead Time เตรียมล่วงหน้า 1-2 วัน)" -ForegroundColor Cyan
    Write-Host "  สต็อกรวม ณ 28/08/69: $($TotalStock28Aug.ToString('N2')) kg | Yield: AFT 60%, TNS 99%" -ForegroundColor Yellow
    Write-Host "===================================================================================================="
    Write-Host "วันส่งมอบ`tวันเตรียมของ (D-2/D-1)`tลูกค้า`tยอดส่ง (kg)`tYield`tใช้วัตถุดิบ (kg)`tสต็อกคงเหลือ (kg)`tสถานะ"
    Write-Host "----------------------------------------------------------------------------------------------------"
    
    $shortagePrepDate = ""
    $shortageDeliveryDate = ""
    $deficitKg = 0
    
    foreach ($item in $schedule) {
        $rawNeeded = [math]::Round($item.FinishedKg / $item.Yield, 2)
        $stock -= $rawNeeded
        
        $status = "✅ พอเตรียมของ"
        if ($stock -lt 0) {
            $status = "❌ วัตถุดิบไม่พอ"
            if (-not $shortagePrepDate) {
                $shortagePrepDate = $item.PrepDate
                $shortageDeliveryDate = $item.DeliveryDate
                $deficitKg = [math]::Abs($stock)
            }
        }
        
        Write-Host "$($item.DeliveryDate)`t$($item.PrepDate)`t`t$($item.Customer)`t$($item.FinishedKg.ToString('N0'))`t`t$($item.Yield*100)%`t$($rawNeeded.ToString('N2'))`t`t$($stock.ToString('N2'))`t$status"
    }
    
    Write-Host "----------------------------------------------------------------------------------------------------"
    Write-Host "`n📌 ข้อสรุปเชิงปฏิบัติการ (Production & Purchasing Timing):"
    Write-Host "1. กะหล่ำปลี AFT ต้องเตรียมปอก/ตัดแต่งล่วงหน้า 1-2 วัน (D-1 ถึง D-2)"
    Write-Host "2. สต็อกปัจจุบัน (16,843.94 kg) พอเตรียมส่งถึงรอบส่ง 05/09/2569 (ซึ่งเริ่มเตรียมของวันที่ 03-04/09)"
    Write-Host "3. รอบส่งวันที่ 07/09/2569 ต้องเริ่มเตรียมของตั้งแต่วันที่ **05-06 กันยายน 2569**"
    Write-Host "4. 🚨 **กำหนดเส้นตายการรับของเข้า (Cut-off Deadline):** กะหล่ำปลีล็อตใหม่ **ต้องเข้าถึงโรงงานภายในวันที่ 05/09/2569 (ไม่เกิน 06/09/2569)** เพื่อให้ทันปอกส่งรอบ 07/09"
}

Calculate-CabbageRunwayWithLeadTime
