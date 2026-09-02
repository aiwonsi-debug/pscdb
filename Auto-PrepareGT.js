const fs = require('fs');
const path = require('path');
const https = require('https');

const agyBaseDir = 'E:\\agy';
const tgConfigPath = path.join(agyBaseDir, 'telegram_config.json');
const notifiedHistoryPath = path.join(agyBaseDir, 'notified_gt_deliveries.json');

function getTelegramConfig() {
    if (fs.existsSync(tgConfigPath)) {
        try {
            return JSON.parse(fs.readFileSync(tgConfigPath, 'utf8'));
        } catch (e) {}
    }
    return { BotToken: '8714398918:AAHryAFzpRwmtFSkPnJOsP8U8TO2CQ-yecM', ChatId: '1532466397' };
}

function sendTGAlert(botToken, chatId, message) {
    return new Promise((resolve) => {
        const payload = JSON.stringify({ chat_id: chatId, text: message });
        const opt = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(payload, 'utf8')
            },
            timeout: 15000
        };
        const req = https.request(opt, (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 300);
        });
        req.on('error', () => resolve(false));
        req.write(payload, 'utf8');
        req.end();
    });
}

async function runAutoPrepareGT(currentDateStr = '2026-08-31') {
    let notified = {};
    if (fs.existsSync(notifiedHistoryPath)) {
        try {
            notified = JSON.parse(fs.readFileSync(notifiedHistoryPath, 'utf8'));
        } catch (e) {}
    }

    const { BotToken, ChatId } = getTelegramConfig();
    const today = new Date(currentDateStr + 'T00:00:00Z');

    const deliveries = [
        { customer: "Siam Yamamori", date: "2026-09-05", ref: "PO6908-2357", items: "แครอท 180 kg, หอมหัวใหญ่ 625 kg" },
        { customer: "Siam Yamamori", date: "2026-09-10", ref: "PO6908-2358", items: "แครอท 136 kg, หอมหัวใหญ่ 1,150 kg" },
        { customer: "AFT", date: "2026-09-01", ref: "AFT-Plan-Sep01", items: "กะหล่ำปลี 2,500 kg, หอมใหญ่ปอกเปลือก 1,500 kg" },
        { customer: "AFT", date: "2026-09-03", ref: "AFT-Plan-Sep03", items: "กะหล่ำปลี 3,000 kg, หอมใหญ่ปอกเปลือก 1,100 kg" },
        { customer: "AFT", date: "2026-09-05", ref: "AFT-Plan-Sep05", items: "กะหล่ำปลี 2,000 kg, แครอท 630 kg, หอมใหญ่ปอกเปลือก 500 kg" },
        { customer: "AFT", date: "2026-09-07", ref: "AFT-Plan-Sep07", items: "กะหล่ำปลี 2,500 kg, หอมใหญ่ปอกเปลือก 1,500 kg" },
        { customer: "AFT", date: "2026-09-08", ref: "AFT-Plan-Sep08", items: "กะหล่ำปลี 2,500 kg, หอมใหญ่ปอกเปลือก 1,500 kg" },
        { customer: "AFT", date: "2026-09-10", ref: "AFT-Plan-Sep10", items: "กะหล่ำปลี 2,000 kg, หอมใหญ่ปอกเปลือก 2,000 kg" },
        { customer: "AFT", date: "2026-09-12", ref: "AFT-Plan-Sep12", items: "กะหล่ำปลี 2,500 kg, แครอท 630 kg, หอมใหญ่ปอกเปลือก 1,000 kg" }
    ];

    let alertsTriggered = 0;

    for (const deliv of deliveries) {
        const dDate = new Date(deliv.date + 'T00:00:00Z');
        const key = `${deliv.customer}_${deliv.ref}_${deliv.date.replace(/-/g, '')}`;

        // Trigger logic
        let triggerDate = new Date(dDate.getTime() - 2 * 24 * 60 * 60 * 1000); // D-2
        let alertLeadText = "ล่วงหน้า 2 วัน (D-2)";
        let sampleDate = new Date(dDate.getTime() - 2 * 24 * 60 * 60 * 1000);

        if (deliv.customer === 'AFT') {
            triggerDate = new Date(dDate.getTime() - 1 * 24 * 60 * 60 * 1000); // D-1
            alertLeadText = "ล่วงหน้า 1 วัน เวลา 12:00 น. (เที่ยงวัน)";
            // If Sunday shift to Saturday
            if (triggerDate.getUTCDay() === 0) {
                triggerDate = new Date(triggerDate.getTime() - 1 * 24 * 60 * 60 * 1000);
                alertLeadText = "ล่วงหน้า 2 วัน (เลื่อนจากวันอาทิตย์เป็นวันเสาร์ 12:00 น.)";
            }
        }

        const isTriggerDay = triggerDate.toISOString().split('T')[0] === currentDateStr;

        if (isTriggerDay && !notified[key]) {
            const formattedDelivery = deliv.date.split('-').reverse().join('/');
            const formattedSample = sampleDate.toISOString().split('T')[0].split('-').reverse().join('/');

            const msg = `🔔 [แจ้งเตือนจัดทำ GT และส่งเอกสาร]\n` +
                        `กำหนดแจ้งเตือน: ${alertLeadText}\n` +
                        `──────────────────\n` +
                        `🏢 ลูกค้า: ${deliv.customer}\n` +
                        `📅 วันที่ส่งมอบ: ${formattedDelivery}\n` +
                        `🧪 วันที่สุ่มตัวอย่าง/ตรวจ GT: ${formattedSample}\n` +
                        `📄 เอกสารอ้างอิง: ${deliv.ref}\n\n` +
                        `📦 รายการสินค้า:\n` +
                        `• ${deliv.items}\n\n` +
                        `กรุณาจัดเตรียมตัวอย่าง ตรวจแล็บ GT และส่งเอกสารให้ลูกค้าตามรอบ`;

            console.log(`[Trigger GT Alert] ${key}`);
            const sent = await sendTGAlert(BotToken, ChatId, msg);
            if (sent) {
                notified[key] = new Date().toISOString();
                alertsTriggered++;
            }
        }
    }

    fs.writeFileSync(notifiedHistoryPath, JSON.stringify(notified, null, 2), 'utf8');
    return alertsTriggered;
}

if (require.main === module) {
    runAutoPrepareGT().then(c => console.log(`Auto-PrepareGT completed. Sent: ${c}`));
}

module.exports = { runAutoPrepareGT };
