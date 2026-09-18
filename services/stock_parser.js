/**
 * stock_parser.js — Deterministic parsing of intake/loading reports and inventory counts from chat messages.
 */

function formatDMY(d = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543}`;
}

function extractLoadingReportFromText(text) {
    if (!text || typeof text !== 'string') return null;
    const hasLoading = /(?:ขึ้นของ|ขึ้นกะหล่ำ|รับเข้า|รับกะหล่ำ|รับหอม|รับพริก|น้ำหนักสุทธิ)/i.test(text);
    if (!hasLoading) return null;

    const dMatch = text.match(/(?:(?:วันที่)\s*)?(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
    let date = dMatch ? dMatch[1] : formatDMY();

    const wMatch = text.match(/(?:น้ำหนักสุทธิ|น้ำหนัก|จำนวน|นน\.)\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)\s*(?:kg|กก\.?|กิโล)/i);
    const weight = wMatch ? parseFloat(wMatch[1].replace(/,/g, '')) : null;

    const fMatch = text.match(/ค่ารถ\s*[:=\-]?\s*([\d,]+(?:\.\d+)?)\s*(?:บ\.?|บาท)/i);
    const freight = fMatch ? parseFloat(fMatch[1].replace(/,/g, '')) : null;

    const sampleMatch = text.match(/สุ่มปอก\s*([\d,]+(?:\.\d+)?)\s*(?:kg|กก\.?|กิโล|กิโลกรัม)/i);
    const peeledMatch = text.match(/ปอกได้\s*([\d,]+(?:\.\d+)?)\s*(?:kg|กก\.?|กิโล|กิโลกรัม)/i);
    const sampleKg = sampleMatch ? parseFloat(sampleMatch[1].replace(/,/g, '')) : null;
    const peeledKg = peeledMatch ? parseFloat(peeledMatch[1].replace(/,/g, '')) : null;
    const yieldPct = sampleKg && peeledKg !== null ? Number(((peeledKg / sampleKg) * 100).toFixed(2)) : null;
    const sizeMatch = text.match(/ขนาด\s*([^\n\r]+)/i);
    const conditionMatch = text.match(/สภาพ(?:โดยรวม)?\s*([^\n\r]+)/i);
    const size = sizeMatch ? sizeMatch[1].trim() : null;
    const condition = conditionMatch ? conditionMatch[1].trim() : null;

    let supplier = 'เฮียหนิง';
    if (text.includes('เจ๊นก') || text.includes('เจ้นก')) supplier = 'เจ๊นก';
    else if (text.includes('เจ๊อารีย์') || text.includes('เจ็อารีย์')) supplier = 'เจ๊อารีย์';
    else if (text.includes('เฮียบุญชู')) supplier = 'เฮียบุญชู';
    else if (text.includes('ป้าผา')) supplier = 'ป้าผา';
    else if (text.includes('ป้าอรทัย')) supplier = 'ป้าอรทัย';

    let location = '';
    if (text.includes('อมพาย')) location = 'โกดัง อมพาย แม่สะเรียง';
    else if (text.includes('ฮอด')) location = 'โกดังฮอด';
    else if (text.includes('แม่แจ่ม')) location = 'แม่แจ่ม';

    let item = 'กะหล่ำปลี';
    if (text.includes('หอมแดง')) item = 'หอมแดง';
    else if (text.includes('พริก')) item = 'พริกหวาน';

    return {
        date,
        supplier,
        item: `${item} (${supplier})`,
        weight_kg: weight,
        freight_baht: freight,
        payment: text.includes('เก็บปลายทาง') ? 'เก็บปลายทาง' : '',
        location,
        sample_kg: sampleKg,
        peeled_kg: peeledKg,
        yield_pct: yieldPct,
        size,
        condition,
        stock_inventory: null
    };
}

function extractStockFromText(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    
    // 1. Strict Exclusion Guard: Must NOT be an intake/shipment/yield/PO message
    const hasIntakeOrOps = /(?:ขึ้นของ|รับเข้า|ขึ้นกะหล่ำ|ขึ้นหอม|กะหล่ำเข้า|หอมเข้า|ค่ารถ|เก็บปลายทาง|สุ่มปอก|ปอกได้|ทะเบียน|สั่งซื้อ|\bPO\b)/i.test(rawText);
    if (hasIntakeOrOps) return null;

    // 2. Strict Intent Guard: Must contain stock header or explicit inventory counting keywords
    const hasStockIntent = /(?:^|\s|\n)(?:stock|สต็อก|สต๊อก|ยอดคงเหลือ|นับสต็อก|ตรวจนับสต็อก|นับจริง|คงคลัง)(?:[:\s\d\n=]|$)/i.test(rawText);
    if (!hasStockIntent) return null;

    // 3. Extract Date if present
    const dateM = rawText.match(/(?:(?:stock|สต็อก|สต๊อก|วันที่|ณ\s*วันที่)\s*)?(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i);
    const date = dateM ? dateM[1] : null;

    // 4. Strict Line-by-Line Item Extraction (Lookahead prevents false matches on boxes/bags/prices)
    const inv = {};
    let foundCount = 0;

    const rules = [
        { k: 'Cabbage', r: /(?:^|\n|\s)กะหล่ำ(?:ปลี)?\s*[:=\-]\s*([\d,]+(?:\.\d+)?)(?:\s*(?:กก\.?|kg|กิโล|กิโลกรัม))?(?=\s*(?:\n|$|\s))(?!.*(?:บาท|บ\.|\/กก|ถุง|กล่อง))/i },
        { k: 'Onion_AFT', r: /(?:^|\n|\s)หอม\s*AFT\s*[:=\-]\s*([\d,]+(?:\.\d+)?)(?:\s*(?:กก\.?|kg|กิโล|กิโลกรัม))?(?=\s*(?:\n|$|\s))(?!.*(?:บาท|บ\.|\/กก|ถุง|กล่อง))/i },
        { k: 'Onion_Chinese', r: /(?:^|\n|\s)หอมจีน\s*[:=\-]\s*([\d,]+(?:\.\d+)?)(?:\s*(?:กก\.?|kg|กิโล|กิโลกรัม))?(?=\s*(?:\n|$|\s))(?!.*(?:บาท|บ\.|\/กก|ถุง|กล่อง))/i },
        { k: 'Carrot', r: /(?:^|\n|\s)แครอท(?:สวย)?\s*[:=\-]\s*([\d,]+(?:\.\d+)?)(?:\s*(?:กก\.?|kg|กิโล|กิโลกรัม))?(?=\s*(?:\n|$|\s))(?!.*(?:บาท|บ\.|\/กก|ถุง|กล่อง))/i },
        { k: 'Purple_Sweet_Potato', r: /(?:^|\n|\s)มันม่วง(?:หัวเล็ก)?\s*[:=\-]\s*([\d,]+(?:\.\d+)?)(?:\s*(?:กก\.?|kg|กิโล|กิโลกรัม))?(?=\s*(?:\n|$|\s))(?!.*(?:บาท|บ\.|\/กก|ถุง|กล่อง))/i },
        { k: 'Yellow_Sweet_Potato', r: /(?:^|\n|\s)มันเหลือง(?:ไข่)?\s*[:=\-]\s*([\d,]+(?:\.\d+)?)(?:\s*(?:กก\.?|kg|กิโล|กิโลกรัม))?(?=\s*(?:\n|$|\s))(?!.*(?:บาท|บ\.|\/กก|ถุง|กล่อง))/i },
        { k: 'Orange_Sweet_Potato', r: /(?:^|\n|\s)มันส้ม\s*[:=\-]\s*([\d,]+(?:\.\d+)?)(?:\s*(?:กก\.?|kg|กิโล|กิโลกรัม))?(?=\s*(?:\n|$|\s))(?!.*(?:บาท|บ\.|\/กก|ถุง|กล่อง))/i }
    ];

    for (const rule of rules) {
        const m = rawText.match(rule.r);
        if (m) {
            const val = parseFloat(m[1].replace(/,/g, ''));
            if (Number.isFinite(val) && val >= 0 && val <= 1000000) {
                inv[rule.k] = val;
                foundCount++;
            }
        }
    }

    if (foundCount > 0) {
        return {
            date: date || formatDMY(),
            inventory: inv,
            rawText
        };
    }
    return null;
}

module.exports = {
    formatDMY,
    extractLoadingReportFromText,
    extractStockFromText
};
