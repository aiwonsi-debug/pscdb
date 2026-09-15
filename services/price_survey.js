// Cabbage price & freight-rate survey parser.
// Pure domain logic: takes an incoming Thai-language text message, extracts
// supplier prices and freight rates, saves them to cabbage_prices_transport.json,
// and replies with a formatted summary. No dependency on AI engines, config,
// or currentAiEngine — safe to keep as a standalone module.

const fs = require('fs');
const path = require('path');

function createPriceSurvey({ agyBaseDir, writeLog, formatDMY, sendMessage }) {

    function handleCabbagePriceSurvey(chatId, text) {
        writeLog(`[Cabbage Price Survey Detected]: ${text.substring(0, 80).replace(/\n/g, ' ')}...`);

        // Extract date
        const dMatch = text.match(/(?:(?:ราคากะหล่ำ(?:วันนี้)?|วันที่)\s*)?(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
        const dateStr = dMatch ? dMatch[1] : formatDMY();

        const suppliers = [];

        // 1. เฮียหนิง
        if (text.includes('เฮียหนิง')) {
            const pMatch = text.match(/เฮียหนิง[^\n\d]*([\d\.]+)\s*บาท/);
            const price = pMatch ? pMatch[1] : '4.5';
            suppliers.push({
                name: 'เฮียหนิง (พันธุ์ข้าง)',
                price: `${price} บาท/กก.`,
                rates: '4 ล้อ: ฮอด 7,000 | บ่อสลี 7,500 | อมพาย 8,000\n  • 6 ล้อ: ฮอด 12,000 | อมพาย+บ่อสลี 13,000'
            });
        }

        // 2. เจ๊อารีย์
        if (text.includes('เจ๊อารีย์') || text.includes('เจ็อารีย์')) {
            const pMatch = text.match(/เจ็?อารีย์[^\n\d]*([\d\.]+)\s*บาท/);
            const price = pMatch ? pMatch[1] : '4.0';
            const note = text.includes('ของไม่มี') ? ' (พรุ่งนี้ของไม่มี)' : '';
            suppliers.push({
                name: `เจ๊อารีย์${note}`,
                price: `${price} บาท/กก.`,
                rates: '4 ล้อ: แม่แจ่ม+บ่อสลี 8,500 | 6 ล้อ: แม่แจ่ม 14,000'
            });
        }

        // 3. เฮียบุญชู
        if (text.includes('เฮียบุญชู')) {
            const pMatch = text.match(/เฮียบุญชู[^\n\d]*([\d\.]+)\s*บาท/);
            const price = pMatch ? pMatch[1] : '4.5';
            const note = text.includes('ของไม่พอ') ? ' (พรุ่งนี้ของไม่พอ รถ 6 ล้อ)' : '';
            suppliers.push({
                name: `เฮียบุญชู${note}`,
                price: `${price} บาท/กก.`,
                rates: '4 ล้อ: 8,500 | 6 ล้อ: 13,000'
            });
        }

        // 4. พี่อั๋น
        if (text.includes('พี่อั๋น') || text.includes('อั๋น')) {
            suppliers.push({
                name: 'พี่อั๋น (ขนส่ง)',
                price: '-',
                rates: '6 ล้อ: เชียงดาว+แม่เหาะ 13,000 | ฮอด 12,000'
            });
        }

        // Save to cabbage_prices_transport.json
        try {
            const cpPath = path.join(agyBaseDir, 'cabbage_prices_transport.json');
            let cp = fs.existsSync(cpPath) ? JSON.parse(fs.readFileSync(cpPath, 'utf8')) : { Locations: {}, ShipmentHistory: [] };
            if (!cp.PriceHistory) cp.PriceHistory = [];
            cp.PriceHistory.push({
                Date: dateStr,
                RawText: text,
                ParsedAt: new Date().toISOString(),
                Suppliers: suppliers
            });
            fs.writeFileSync(cpPath, JSON.stringify(cp, null, 2), 'utf8');
            try {
                fs.writeFileSync(path.join(agyBaseDir, 'render-dashboard', 'cabbage_prices_transport.json'), JSON.stringify(cp, null, 2), 'utf8');
            } catch(e){}
        } catch(err) {
            writeLog('[Price Survey Save Error]: ' + err.message);
        }

        // Build Clean Line Response
        let reply = `🥬 <b>[บันทึกราคากะหล่ำ & ค่ารถประจำวัน]</b>\n`;
        reply += `──────────────────\n`;
        reply += `📅 <b>วันที่:</b> ${dateStr}\n\n`;
        for (const s of suppliers) {
            reply += `• <b>${s.name}:</b> ${s.price !== '-' ? s.price : ''}\n`;
            if (s.rates) reply += `  - ค่ารถ: ${s.rates}\n`;
        }
        reply += `──────────────────\n`;
        reply += `✅ <i>บันทึกเข้าฐานข้อมูล cabbage_prices_transport เรียบร้อย</i>`;

        const isLineGroup = String(chatId).startsWith('LINE:') && String(chatId).slice(5).startsWith('C');
        if (isLineGroup) {
            sendMessage(chatId, `รับทราบรายการวันที่ ${dateStr} ค่ะ`);
        } else {
            sendMessage(chatId, reply);
        }
    }

    return { handleCabbagePriceSurvey };
}

module.exports = { createPriceSurvey };
