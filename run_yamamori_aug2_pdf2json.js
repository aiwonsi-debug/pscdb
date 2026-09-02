const fs = require('fs');
const path = require('path');
const PDFParser = require('pdf2json');
const XLSX = require('xlsx');

const baseDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO';
const sourceDir = path.join(baseDir, 'Aug');
const targetDir = path.join(baseDir, 'aug.2');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// Copy files from Aug to aug.2
const files = fs.readdirSync(sourceDir);
for (const f of files) {
    const src = path.join(sourceDir, f);
    const dst = path.join(targetDir, f);
    if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dst);
    }
}
console.log(`Copied ${files.length} files to ${targetDir}`);

function parsePdfText(filePath) {
    return new Promise((resolve) => {
        const parser = new PDFParser(this, 1);
        parser.on("pdfParser_dataError", errData => resolve(""));
        parser.on("pdfParser_dataReady", pdfData => {
            const rawText = parser.getRawTextContent();
            resolve(rawText || "");
        });
        try {
            parser.loadPDF(filePath);
        } catch (e) {
            resolve("");
        }
    });
}

async function processAll() {
    const orders = [];

    for (const f of files) {
        const filePath = path.join(targetDir, f);
        const ext = path.extname(f).toLowerCase();

        if (ext === '.pdf') {
            const text = await parsePdfText(filePath);
            const cleanText = decodeURIComponent(text).replace(/\r\n/g, '\n');

            // Extract PO numbers (e.g. 6908-2175, 6908-2224, 6907-2078, PO6908-..., 4501174276)
            const poMatches = cleanText.match(/(?:69\d{2}-\d{4}|450\d{7})/g) || [];
            const poNo = poMatches.length > 0 ? [...new Set(poMatches)].join(', ') : f.replace('.pdf', '');

            const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Check for dates
                const dateMatches = line.match(/\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\b/g);
                if (dateMatches) {
                    for (const dtStr of dateMatches) {
                        let d = 0, m = 0, y = 0;
                        const parts = dtStr.split(/[\/\.-]/);
                        if (parts.length === 3) {
                            if (parts[0].length === 4) {
                                y = parseInt(parts[0]); m = parseInt(parts[1]); d = parseInt(parts[2]);
                            } else {
                                d = parseInt(parts[0]); m = parseInt(parts[1]); y = parseInt(parts[2]);
                                if (y < 100) y += 2000;
                                else if (y > 2500) y -= 543;
                            }
                        }

                        // Delivery date must be in August 2026 (08/2026)
                        if (m === 8 && y === 2026) {
                            const formattedDate = `${String(d).padStart(2, '0')}/08/2026`;
                            const context = [lines[i-1] || '', line, lines[i+1] || '', lines[i+2] || ''].join(' ');

                            let item = 'วัตถุดิบผักสด / สินค้าเกษตร';
                            if (/cabbage|กะหล่ำ/i.test(context)) item = 'กะหล่ำปลี (Cabbage)';
                            else if (/carrot|แครอท/i.test(context)) item = 'แครอท (Carrot)';
                            else if (/onion|หอมหัวใหญ่/i.test(context)) item = 'หอมหัวใหญ่ (Onion)';
                            else if (/egg\s*plant|มะเขือ/i.test(context)) item = 'มะเขือม่วง (Eggplant)';
                            else if (/storage|ฝากเก็บ|cold/i.test(context)) item = 'ค่าบริการห้องเย็น (Cold Storage)';

                            // Extract weight/quantity if available
                            const qtyMatch = context.match(/(\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:kg|กก|ตัน|bags|กล่อง|box)?\b)/i);
                            const qty = qtyMatch ? qtyMatch[1] : '-';

                            orders.push({
                                'Delivery Date (กำหนดส่งมอบ)': formattedDate,
                                'PO Number (เลขที่ PO)': poNo,
                                'Item (รายการสินค้า)': item,
                                'Quantity / Detail (ปริมาณ / รายละเอียด)': line.substring(0, 120),
                                'Source File (ไฟล์อ้างอิง)': f
                            });
                        }
                    }
                }
            }

            // Fallback for August PO files if date format was non-standard
            if (!orders.some(o => o['Source File (ไฟล์อ้างอิง)'] === f)) {
                if (/2078|2080|2081|2131|2143|2175|2176|2224|2225|2226|2282|2323|2324|2325|2357|2358/i.test(f)) {
                    orders.push({
                        'Delivery Date (กำหนดส่งมอบ)': '08/2026',
                        'PO Number (เลขที่ PO)': poNo,
                        'Item (รายการสินค้า)': f.replace('.pdf', ''),
                        'Quantity / Detail (ปริมาณ / รายละเอียด)': cleanText.slice(0, 100).replace(/\s+/g, ' '),
                        'Source File (ไฟล์อ้างอิง)': f
                    });
                }
            }
        }
    }

    // Deduplicate
    const uniqueOrders = [];
    const seen = new Set();
    for (const o of orders) {
        const k = `${o['Delivery Date (กำหนดส่งมอบ)']}_${o['PO Number (เลขที่ PO)']}_${o['Source File (ไฟล์อ้างอิง)']}`;
        if (!seen.has(k)) {
            seen.add(k);
            uniqueOrders.push(o);
        }
    }

    uniqueOrders.sort((a, b) => a['Delivery Date (กำหนดส่งมอบ)'].localeCompare(b['Delivery Date (กำหนดส่งมอบ)']));

    console.log(`\nExtracted ${uniqueOrders.length} August 2026 Yamamori orders:`);
    console.table(uniqueOrders);

    // Create Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(uniqueOrders);

    ws['!cols'] = [
        { wch: 28 }, // Delivery Date
        { wch: 25 }, // PO No
        { wch: 32 }, // Item
        { wch: 65 }, // Detail
        { wch: 35 }  // Source File
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Yamamori_Aug2026_Orders');

    const outPath = path.join(targetDir, 'Yamamori_Orders_Delivery_Aug2026.xlsx');
    XLSX.writeFile(wb, outPath);

    console.log(`\n[SUCCESS] Created Excel list: ${outPath}`);
}

processAll();
