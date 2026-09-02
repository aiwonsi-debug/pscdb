const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Robust pure Node.js XLSX Reader for TNS Order PSC.xlsx & SEP Order PSC.xlsx
function extractTNSOrders(filePath, targetYearFilter = '2026') {
    if (!fs.existsSync(filePath)) {
        console.error('[TNSParser] File not found:', filePath);
        return [];
    }

    const buffer = fs.readFileSync(filePath);
    const uncompressed = {};
    let offset = 0;

    while (offset < buffer.length - 4) {
        const sig = buffer.readUInt32LE(offset);
        if (sig === 0x04034b50) {
            const compMethod = buffer.readUInt16LE(offset + 8);
            const compSize = buffer.readUInt32LE(offset + 18);
            const fnLen = buffer.readUInt16LE(offset + 26);
            const extraLen = buffer.readUInt16LE(offset + 28);
            const filename = buffer.toString('utf8', offset + 30, offset + 30 + fnLen);
            const dataStart = offset + 30 + fnLen + extraLen;
            const dataEnd = dataStart + compSize;

            if (compMethod === 8) {
                try {
                    uncompressed[filename] = zlib.inflateRawSync(buffer.slice(dataStart, dataEnd)).toString('utf8');
                } catch(e) {}
            } else if (compMethod === 0) {
                uncompressed[filename] = buffer.slice(dataStart, dataEnd).toString('utf8');
            }
            offset = dataEnd;
        } else if (sig === 0x02014b50) {
            break;
        } else {
            offset++;
        }
    }

    // Shared strings
    const sharedStrings = [];
    if (uncompressed['xl/sharedStrings.xml']) {
        const ssXml = uncompressed['xl/sharedStrings.xml'];
        const matches = ssXml.match(/<t[^>]*>(.*?)<\/t>/gs) || [];
        matches.forEach(m => {
            const text = m.replace(/<\/?t[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
            sharedStrings.push(text);
        });
    }

    // Sheets list from workbook.xml
    const sheetMap = [];
    if (uncompressed['xl/workbook.xml']) {
        const wbXml = uncompressed['xl/workbook.xml'];
        const sMatches = wbXml.match(/<sheet\s+name="([^"]+)"\s+sheetId="([^"]+)"/g) || [];
        sMatches.forEach((sm, idx) => {
            const nameMatch = sm.match(/name="([^"]+)"/);
            if (nameMatch) {
                sheetMap.push({ name: nameMatch[1], file: `xl/worksheets/sheet${idx+1}.xml` });
            }
        });
    }

    const monthLookup = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };

    const colProducts = {
        'B': 'หอมแดง',
        'C': 'ผักชีใหญ่',
        'D': 'แครอท',
        'E': 'ต้นหอม',
        'F': 'กะหล่ำปลี',
        'G': 'ขิง',
        'H': 'Western Celery',
        'I': 'พริกหวานเขียว',
        'J': 'มะละกอ'
    };

    const allOrders = [];

    sheetMap.forEach(sh => {
        // Skip summary / total year sheets
        if (sh.name.toLowerCase().includes('total') || sh.name.toLowerCase().includes('year')) return;

        // Parse Exact Year from sheet name: e.g. "Sep-26" -> 2026, "Aug-26" -> 2026, "Sep. 23" -> 2023
        let yearStr = '2026';
        const yMatch = sh.name.match(/[\.\s\-_](\d{2})(?!\d)/);
        if (yMatch) {
            yearStr = '20' + yMatch[1];
        } else {
            const y4Match = sh.name.match(/(20\d{2})/);
            if (y4Match) yearStr = y4Match[1];
        }

        // Apply year filter if specified
        if (targetYearFilter && yearStr !== targetYearFilter) {
            return;
        }

        let monthStr = '09';
        for (const [mName, mNum] of Object.entries(monthLookup)) {
            if (sh.name.toLowerCase().includes(mName)) {
                monthStr = mNum;
                break;
            }
        }

        const sheetXml = uncompressed[sh.file];
        if (!sheetXml) return;

        // Extract rows
        const rowRegex = /<row\s+r="(\d+)"[^>]*>(.*?)<\/row>/gs;
        let rMatch;
        while ((rMatch = rowRegex.exec(sheetXml)) !== null) {
            const rowNum = parseInt(rMatch[1], 10);
            if (rowNum < 3 || rowNum > 33) continue; // Only day rows 3..33

            const rowContent = rMatch[2];
            const cells = {};

            // Split by '<c ' to parse every cell individually
            const chunks = rowContent.split('<c ');
            for (let i = 1; i < chunks.length; i++) {
                const chunk = chunks[i];
                const refMatch = chunk.match(/^r="([A-Z]+)(\d+)"/);
                if (refMatch) {
                    const col = refMatch[1];
                    const vMatch = chunk.match(/<v>(.*?)<\/v>/);
                    if (vMatch) {
                        let val = vMatch[1];
                        if (chunk.includes('t="s"')) {
                            val = sharedStrings[parseInt(val, 10)] || val;
                        }
                        cells[col] = val.trim();
                    }
                }
            }

            const dayVal = cells['A'];
            const dayNum = parseInt(dayVal, 10);

            if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
                const dayStr = String(dayNum).padStart(2, '0');
                const dateISO = `${yearStr}-${monthStr}-${dayStr}`;

                for (const [col, prodName] of Object.entries(colProducts)) {
                    if (cells[col]) {
                        const qty = parseFloat(cells[col].replace(/,/g, ''));
                        if (!isNaN(qty) && qty > 0) {
                            allOrders.push({
                                date: dateISO,
                                day: dayNum,
                                month: monthStr,
                                year: yearStr,
                                product: prodName,
                                qty: qty,
                                unit: 'กก.',
                                sheet: sh.name
                            });
                        }
                    }
                }
            }
        }
    });

    allOrders.sort((a, b) => a.date.localeCompare(b.date));
    return allOrders;
}

function findLatestTNSFile() {
    const candidates = [
        'E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\SEP Order PSC.xlsx',
        'E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\Sep Order PSC.xlsx',
        'E:\\รวมงาน\\งาน 25-26\\TNS\\Order PSC.xlsx',
        'E:\\รวมงาน\\งาน 25-26\\Order PSC.xlsx',
        'E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\Aug\\Order PSC.xlsx'
    ];

    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

module.exports = {
    extractTNSOrders,
    findLatestTNSFile
};
