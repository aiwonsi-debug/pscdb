const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');

const targetDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO\\Aug.1';

async function parseAllFiles() {
    const files = fs.readdirSync(targetDir);
    console.log(`Found ${files.length} files in ${targetDir}\n`);

    const augOrders = [];
    const nonAugOrders = [];

    for (const file of files) {
        const filePath = path.join(targetDir, file);
        const ext = path.extname(file).toLowerCase();

        if (ext === '.pdf') {
            try {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(dataBuffer);
                const text = pdfData.text;

                // Extract key details from text
                // Siam Yamamori PO fields: PO No, Date, Delivery Date, Item, Quantity, Price
                const poNoMatch = text.match(/(?:P\.O\.\s*No\.|PO\s*No\.|เลขที่ใบสั่งซื้อ)\s*[:\.]?\s*([A-Z0-9\/-]+)/i) ||
                                  text.match(/(69\d{2}-\d{4})/);
                const poNo = poNoMatch ? poNoMatch[1] : 'Unknown';

                // Look for delivery dates in text
                // Matches patterns like DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Month YYYY
                const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                
                let foundItems = [];

                lines.forEach((line, idx) => {
                    // Look for dates
                    const dateMatches = line.match(/\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\b/g) ||
                                        line.match(/\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/gi);
                    
                    if (dateMatches) {
                        // Check if any date in this line or nearby is in August 2026 (08/2026 or Aug 2026 or 2026-08)
                        dateMatches.forEach(dt => {
                            if (dt.includes('/08/26') || dt.includes('/08/2026') || dt.includes('.08.26') || dt.includes('.08.2026') || dt.includes('-08-26') || dt.includes('-08-2026') || /aug/i.test(dt)) {
                                foundItems.push({ line, date: dt });
                            }
                        });
                    }
                });

                // Also extract full structured info if present
                const fullSummary = {
                    file,
                    poNo,
                    numPages: pdfData.numpages,
                    rawTextSnippet: text.slice(0, 500).replace(/\s+/g, ' '),
                    allDates: [...new Set(text.match(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/g) || [])],
                    augItems: foundItems
                };

                if (foundItems.length > 0 || /aug|\/08\//i.test(text)) {
                    augOrders.push(fullSummary);
                } else {
                    nonAugOrders.push(fullSummary);
                }

            } catch (e) {
                console.error(`Error reading ${file}:`, e.message);
            }
        } else if (ext === '.xlsx' || ext === '.xls') {
            try {
                const workbook = XLSX.readFile(filePath);
                let excelText = '';
                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    excelText += XLSX.utils.sheet_to_csv(sheet) + '\n';
                });

                const allDates = [...new Set(excelText.match(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/g) || [])];
                const isAug = /aug|\/08\//i.test(excelText) || allDates.some(d => d.includes('/08/') || d.includes('-08-'));

                const summary = {
                    file,
                    poNo: 'Excel Plan',
                    allDates,
                    augItems: isAug ? ['Excel file contains August 2026 references'] : []
                };

                if (isAug) augOrders.push(summary);
                else nonAugOrders.push(summary);

            } catch (e) {
                console.error(`Error reading Excel ${file}:`, e.message);
            }
        }
    }

    console.log(`=== AUGUST 2026 DELIVERY POs (${augOrders.length} files) ===`);
    console.log(JSON.stringify(augOrders, null, 2));

    console.log(`\n=== NON-AUGUST POs (${nonAugOrders.length} files) ===`);
    nonAugOrders.forEach(o => console.log(`- ${o.file} (Dates: ${o.allDates.join(', ')})`));
}

parseAllFiles();
