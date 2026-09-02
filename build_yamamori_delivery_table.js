const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const baseDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO\\aug.2';
const imgDir = path.join(baseDir, 'ocr_extracted_images');

const txtFiles = fs.readdirSync(imgDir).filter(f => f.endsWith('.txt'));

const detailedOrders = [];

txtFiles.forEach(tf => {
    const txtPath = path.join(imgDir, tf);
    const content = fs.readFileSync(txtPath, 'utf8');
    
    // Find PO No e.g. 6907-2078, 6908-2175, 6908-2224, 6908-2323, 6908-2357, etc.
    const poMatch = content.match(/69\d{2}[-\s]?\d{4}/);
    if (!poMatch) return; // Skip non-PO documents (e.g. certificates, RM specs)

    const poNo = poMatch[0].replace(/\s+/g, '-');

    // Find Issue Date & Delivery Date in text
    // Patterns in Yamamori PO:
    // "Date : DD/MM/YYYY" -> Issue Date
    // "Delivery : DD/MM/YYYY" or "Delivery Date : DD/MM/YYYY" -> Delivery Date
    let issueDate = '-';
    let deliveryDate = '-';

    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    lines.forEach((line, idx) => {
        // Delivery Date pattern
        const delivMatch = line.match(/(?:delivery|กำหนดส่ง|ส่งของ|deliv|d\/c)\s*[:\.]?\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
        if (delivMatch) {
            deliveryDate = delivMatch[1];
        }

        // Issue Date pattern
        const dateMatch = line.match(/(?:date|วันที่|issue)\s*[:\.]?\s*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
        if (dateMatch && !/delivery/i.test(line)) {
            issueDate = dateMatch[1];
        }
    });

    // Fallback search for dates in table rows if deliveryDate not found
    if (deliveryDate === '-') {
        // In Yamamori PO table, column headers often have Delivery Date
        const allDates = content.match(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/g) || [];
        if (allDates.length >= 2) {
            issueDate = allDates[0];
            deliveryDate = allDates[1];
        } else if (allDates.length === 1) {
            deliveryDate = allDates[0];
        }
    }

    // Extract item details
    const items = [];
    lines.forEach(line => {
        if (/carrot|แครอท/i.test(line)) {
            const qtyMatch = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:kg|กก)?/i);
            items.push(`แครอท (Carrot) ${qtyMatch ? qtyMatch[1] + ' kg' : ''}`);
        }
        if (/onion|หอมหัวใหญ่/i.test(line)) {
            const qtyMatch = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:kg|กก)?/i);
            items.push(`หอมหัวใหญ่ (Onion) ${qtyMatch ? qtyMatch[1] + ' kg' : ''}`);
        }
        if (/cabbage|กะหล่ำ/i.test(line)) {
            const qtyMatch = line.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:kg|กก)?/i);
            items.push(`กะหล่ำปลี (Cabbage) ${qtyMatch ? qtyMatch[1] + ' kg' : ''}`);
        }
    });

    detailedOrders.push({
        'เลขที่ PO': poNo,
        'วันที่ออกเอกสาร (Issue Date)': issueDate,
        'กำหนดส่งมอบ (Delivery Date)': deliveryDate,
        'รายการสินค้า (Items)': items.length > 0 ? [...new Set(items)].join(' | ') : 'ผักสด / วัตถุดิบ',
        'ไฟล์ต้นฉบับ (File Source)': tf.replace(/_p\d+\.txt$/, '.pdf')
    });
});

// Deduplicate
const uniqueMap = new Map();
detailedOrders.forEach(o => {
    const key = `${o['เลขที่ PO']}_${o['กำหนดส่งมอบ (Delivery Date)']}`;
    if (!uniqueMap.has(key)) {
        uniqueMap.set(key, o);
    }
});

const finalReport = Array.from(uniqueMap.values());
finalReport.sort((a, b) => a['เลขที่ PO'].localeCompare(b['เลขที่ PO']));

console.log('\n================================================================');
console.log('       📋 SIAM YAMAMORI PO DELIVERY DATES BREAKDOWN');
console.log('================================================================\n');
console.table(finalReport);

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(finalReport);

ws['!cols'] = [
    { wch: 18 }, // PO No
    { wch: 25 }, // Issue Date
    { wch: 25 }, // Delivery Date
    { wch: 45 }, // Items
    { wch: 30 }  // Source
];

XLSX.utils.book_append_sheet(wb, ws, 'Yamamori_Delivery_Dates');
const outExcel = path.join(baseDir, 'Siam_Yamamori_PO_Delivery_Dates_Summary.xlsx');
XLSX.writeFile(wb, outExcel);

console.log(`\n[SUCCESS] Final Excel saved: ${outExcel}`);
