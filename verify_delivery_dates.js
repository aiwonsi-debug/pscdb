const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const baseDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO\\aug.2';
const imgDir = path.join(baseDir, 'ocr_extracted_images');

const txtFiles = fs.readdirSync(imgDir).filter(f => f.endsWith('.txt'));

console.log('========================================================================================================');
console.log('         🔍 DEEP AUDIT: LINE-BY-LINE EXTRACTION OF EXACT DELIVERY DATES (SIAM YAMAMORI)');
console.log('========================================================================================================\n');

const results = [];

txtFiles.forEach(tf => {
    const txtPath = path.join(imgDir, tf);
    const content = fs.readFileSync(txtPath, 'utf8');

    // Match PO Number e.g. 6907-2078, 6908-2175, etc.
    const poMatch = content.match(/69\d{2}[-\s]?\d{4}/);
    if (!poMatch) return;

    const poNo = poMatch[0].replace(/\s+/g, '-');
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    // Let's find:
    // 1. Issue Date / PO Date (หัวเอกสาร วันที่สั่งซื้อ)
    // 2. Delivery Date (กำหนดวันส่งมอบสินค้าจริง)
    // 3. Items & Quantities
    let poDate = '-';
    let deliveryDate = '-';
    let deliveryDateLines = [];
    let items = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // PO Date match (e.g. Date: 24/07/2026, 06/08/2026, 14/08/2026, 25/08/2026, 28/08/2026)
        if (/(?:P\.O\.\s*Date|PO\s*Date|Date\s*:|วันที่\s*:)/i.test(line) && !/delivery/i.test(line)) {
            const dm = line.match(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/);
            if (dm && poDate === '-') poDate = dm[0];
        }

        // Delivery Date match in table / headers
        // Common pattern in Yamamori PO:
        // Table columns: No. | Description | Qty | Unit | Unit Price | Amount | Delivery Date
        // Or line with "Delivery Date", "D/C Date", "Delivery : DD/MM/YYYY"
        if (/delivery\s*date|กำหนดส่ง|วันส่งมอบ|delivery\s*:/i.test(line) || /d\/c/i.test(line)) {
            deliveryDateLines.push(line);
            const dm = line.match(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/g);
            if (dm) {
                deliveryDate = dm[dm.length - 1]; // take date on that line
            }
        }

        // Product Items & Weights
        if (/carrot|แครอท/i.test(line)) {
            const m = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:kg|กก)?/i);
            const price = line.match(/(\d+\.\d{2})/);
            items.push({ item: 'แครอท (Carrot)', qty: m ? m[1] : '-', price: price ? price[1] : '-' });
        }
        if (/onion|หอมหัวใหญ่/i.test(line)) {
            const m = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:kg|กก)?/i);
            const price = line.match(/(\d+\.\d{2})/);
            items.push({ item: 'หอมหัวใหญ่ (Onion)', qty: m ? m[1] : '-', price: price ? price[1] : '-' });
        }
        if (/cabbage|กะหล่ำ/i.test(line)) {
            const m = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:kg|กก)?/i);
            const price = line.match(/(\d+\.\d{2})/);
            items.push({ item: 'กะหล่ำปลี (Cabbage)', qty: m ? m[1] : '-', price: price ? price[1] : '-' });
        }
    }

    // If deliveryDate still not isolated, check date pattern in table columns
    const allDates = content.match(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/g) || [];
    if (deliveryDate === '-' && allDates.length >= 2) {
        poDate = allDates[0];
        deliveryDate = allDates[1];
    } else if (deliveryDate === '-' && allDates.length === 1) {
        deliveryDate = allDates[0];
    }

    // Format display
    results.push({
        file: tf,
        poNo,
        poDate,
        deliveryDate,
        deliveryDateLines: deliveryDateLines.join(' | '),
        items: items.map(it => `${it.item} [${it.qty} kg @ ${it.price} บ.]`).join(' + ') || 'ผักสด / วัตถุดิบ',
        allDates: [...new Set(allDates)].join(', ')
    });
});

// Group by PO Number
const poMap = new Map();
results.forEach(r => {
    if (!poMap.has(r.poNo)) {
        poMap.set(r.poNo, r);
    }
});

const verifiedPOs = Array.from(poMap.values()).sort((a, b) => a.poNo.localeCompare(b.poNo));

console.table(verifiedPOs.map(p => ({
    'เลขที่ PO': p.poNo,
    'วันออก PO (PO Date)': p.poDate,
    '🎯 วันส่งของที่ถูกต้อง (Delivery Date)': p.deliveryDate,
    'รายการสินค้า + ปริมาณ': p.items,
    'วันที่ทั้งหมดในเอกสาร': p.allDates
})));

// Export Verified Delivery Dates Excel
const wb = XLSX.utils.book_new();
const wsData = verifiedPOs.map((p, idx) => ({
    'ลำดับ': idx + 1,
    'เลขที่ PO (PO Number)': p.poNo,
    'วันที่ออกเอกสาร (PO Issue Date)': p.poDate,
    '🎯 กำหนดส่งสินค้าที่ถูกต้อง (Verified Delivery Date)': p.deliveryDate,
    'รายการสินค้าและจำนวน (Items & Quantities)': p.items,
    'วันที่ทั้งหมดที่พบในเอกสาร (All Dates in Doc)': p.allDates,
    'ไฟล์ OCR อ้างอิง': p.file
}));

const ws = XLSX.utils.json_to_sheet(wsData);
ws['!cols'] = [
    { wch: 8 },
    { wch: 20 },
    { wch: 25 },
    { wch: 35 },
    { wch: 45 },
    { wch: 30 },
    { wch: 30 }
];

XLSX.utils.book_append_sheet(wb, ws, 'Verified_Delivery_Dates');
const outExcel = path.join(baseDir, 'Siam_Yamamori_Verified_Delivery_Dates.xlsx');
XLSX.writeFile(wb, outExcel);

console.log(`\n[SUCCESS] Verified Delivery Schedule saved to: ${outExcel}`);
