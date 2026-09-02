const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');

const baseDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO';
const sourceDir = path.join(baseDir, 'Aug');
const targetDir = path.join(baseDir, 'aug.2');

if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`Created target directory: ${targetDir}`);
}

async function run() {
    const files = fs.readdirSync(sourceDir);
    console.log(`Found ${files.length} files in source directory (${sourceDir})\n`);

    // Copy all files to aug.2
    for (const f of files) {
        const srcFile = path.join(sourceDir, f);
        const dstFile = path.join(targetDir, f);
        if (fs.statSync(srcFile).isFile()) {
            fs.copyFileSync(srcFile, dstFile);
        }
    }
    console.log(`Copied ${files.length} files to ${targetDir}\n`);

    const orderRows = [];

    for (const file of files) {
        const filePath = path.join(targetDir, file);
        const ext = path.extname(file).toLowerCase();

        if (ext === '.pdf') {
            try {
                const buf = fs.readFileSync(filePath);
                const pdf = await pdfParse(buf);
                const text = pdf.text;

                const poMatches = text.match(/(?:69\d{2}-\d{4}|450\d{7})/g) || [];
                const poNumbers = [...new Set(poMatches)];
                const poNoStr = poNumbers.length > 0 ? poNumbers.join(', ') : file.replace('.pdf', '');

                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    
                    const dateMatches = line.match(/\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\b/g);
                    if (dateMatches) {
                        for (const dtStr of dateMatches) {
                            let d = 0, m = 0, y = 0;
                            const parts = dtStr.split(/[\/\.-]/);
                            if (parts.length === 3) {
                                if (parts[0].length === 4) {
                                    y = parseInt(parts[0]);
                                    m = parseInt(parts[1]);
                                    d = parseInt(parts[2]);
                                } else {
                                    d = parseInt(parts[0]);
                                    m = parseInt(parts[1]);
                                    y = parseInt(parts[2]);
                                    if (y < 100) y += 2000;
                                    else if (y > 2500) y -= 543;
                                }
                            }

                            if (m === 8 && y === 2026) {
                                const formattedDate = `${String(d).padStart(2, '0')}/08/2026`;
                                
                                const context = [lines[i-1] || '', line, lines[i+1] || '', lines[i+2] || ''].join(' ');
                                
                                let item = 'ผักสด / วัตถุดิบ';
                                if (/cabbage|กะหล่ำ/i.test(context)) item = 'กะหล่ำปลี (Cabbage)';
                                else if (/carrot|แครอท/i.test(context)) item = 'แครอท (Carrot)';
                                else if (/onion|หอม/i.test(context)) item = 'หอมหัวใหญ่ (Onion)';
                                else if (/egg\s*plant|มะเขือ/i.test(context)) item = 'มะเขือม่วง (Eggplant)';
                                else if (/storage|ฝากเก็บ/i.test(context)) item = 'ค่าบริการห้องเย็น (Cold Storage)';

                                const qtyMatch = context.match(/(\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:kg|กก|ตัน|bags|กล่อง|box)?\b)/i);
                                const qty = qtyMatch ? qtyMatch[1] : '-';

                                orderRows.push({
                                    'Delivery Date': formattedDate,
                                    'PO No.': poNoStr,
                                    'Item / Description': item,
                                    'Quantity / Detail': line.substring(0, 100),
                                    'Source File': file
                                });
                            }
                        }
                    }
                }

                if (!orderRows.some(r => r['Source File'] === file)) {
                    if (/Aug|8-2026|2080|2081|2131|2143|2175|2176|2224|2225|2226|2282|2323|2324|2325|2357|2358/i.test(file)) {
                        orderRows.push({
                            'Delivery Date': '08/2026 (Ref file)',
                            'PO No.': poNoStr,
                            'Item / Description': file.replace('.pdf', ''),
                            'Quantity / Detail': text.slice(0, 80).replace(/\s+/g, ' '),
                            'Source File': file
                        });
                    }
                }

            } catch (err) {
                console.error(`Error parsing ${file}:`, err.message);
            }
        }
    }

    const cleanRows = [];
    const seen = new Set();
    for (const r of orderRows) {
        const key = `${r['Delivery Date']}_${r['PO No.']}_${r['Source File']}`;
        if (!seen.has(key)) {
            seen.add(key);
            cleanRows.push(r);
        }
    }

    cleanRows.sort((a, b) => a['Delivery Date'].localeCompare(b['Delivery Date']));

    console.log(`\n=== Extracted ${cleanRows.length} August 2026 Orders ===`);
    console.table(cleanRows);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(cleanRows);

    ws['!cols'] = [
        { wch: 16 },
        { wch: 25 },
        { wch: 30 },
        { wch: 60 },
        { wch: 35 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Yamamori_Aug2026_Orders');

    const outExcelPath = path.join(targetDir, 'Yamamori_Orders_Delivery_Aug2026.xlsx');
    XLSX.writeFile(wb, outExcelPath);

    console.log(`\n[SUCCESS] Created Excel summary: ${outExcelPath}`);
}

run();
