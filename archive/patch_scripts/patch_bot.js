const fs = require('fs');
let file = 'E:/agy/bot.js';

let content = fs.readFileSync(file, 'utf8');

// The block to replace:
const startPattern = '    if (isReportPattern) {\r\n        const { recordLoadingReport } = require(\'./webhook_server.js\');\r\n        const lines = text.split(\'\\n\').map(l => l.trim()).filter(l => l);';

const replacement = `    if (isReportPattern) {
        const { recordLoadingReport } = require('./webhook_server.js');
        
        sendMessage(chatId, '🔄 [AI Extractor]: กำลังใช้ AI วิเคราะห์และสกัดข้อมูลจากข้อความของคุณ กรุณารอสักครู่...');
        sendChatAction(chatId, 'typing');

        const systemPrompt = \`คุณคือ AI สกัดข้อมูลระดับมืออาชีพ จงสกัดข้อมูลจากข้อความรายงานขึ้นของ/รับเข้า ต่อไปนี้ แล้วคืนค่าเป็น JSON เท่านั้น
รูปแบบ JSON ที่ต้องการ:
{
  "date": "วันที่ (เช่น 02/09/26 ถ้าไม่มีระบุให้เป็นสตริงว่าง)",
  "item": "รายการสินค้าและคนขึ้นของ (เช่น ขึ้นกะหล่ำปลีเฮียหนิง)",
  "weight": "น้ำหนักสุทธิ พร้อมหน่วย (เช่น 9,200kg หรือ 8,500kg)",
  "freight": "ค่ารถ พร้อมหน่วย (เช่น 13,000บาท)",
  "payment": "การชำระเงิน (เช่น เก็บปลายทาง 13,000 บาท)",
  "location": "สถานที่ (เช่น โกดัง อมพาย แม่สะเรียง)",
  "receivedYield": 74.8, // ตัวเลขเปอร์เซ็นต์ Yield ถ้ามี หากไม่มีให้เป็น null
  "receivedPrice": 3, // ตัวเลขราคาต่อกก. ถ้ามี หากไม่มีให้เป็น null
  "receivedCondition": "สภาพ (เช่น ดี แมง+ราเล็กน้อย) หากไม่มีให้เป็นสตริงว่าง",
  "receivedSize": "ขนาด (เช่น กลาง) หากไม่มีให้เป็นสตริงว่าง"
}
ห้ามมโนหรืออุปโลกข้อมูลเด็ดขาด ถ้าไม่พบข้อมูลใดในข้อความ ให้ใส่เป็นสตริงว่าง ("") หรือ null เท่านั้น ห้ามตอบนอกเหนือจาก JSON\`

        const postData = JSON.stringify({
            model: GROQ_CONFIG.Model,
            response_format: { type: "json_object" },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text }
            ]
        });

        const urlObj = require('url').parse(GROQ_CONFIG.Url);
        const req = require('https').request({
            hostname: urlObj.hostname,
            path: urlObj.path,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + GROQ_CONFIG.ApiKey,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
                        let resultJson = {};
                        try {
                            resultJson = JSON.parse(parsed.choices[0].message.content.trim());
                        } catch(e) {
                            sendMessage(chatId, '❌ [AI Error]: ตอบกลับมาไม่เป็น JSON \\n' + parsed.choices[0].message.content);
                            return;
                        }

                        let item = resultJson.item || 'ขึ้นกะหล่ำปลี';
                        let date = resultJson.date || 'ไม่ระบุ';
                        
                        let cardId = 'salaya_0209';
                        if (item.includes('หอมแดง') || text.includes('หอมแดง')) {
                            if (date.includes('21') || date.includes('20')) cardId = 'tns_shallot_2109';
                            else cardId = 'tns_shallot_0709';
                        } else if (item.includes('พริก') || text.includes('พริก')) {
                            cardId = 'tns_pepper_1609';
                        } else if (item.includes('มะละกอ') || item.includes('celery') || item.includes('เซเลอรี่')) {
                            cardId = 'tns_papaya_celery';
                        } else {
                            if (date.includes('07') || date.includes('08') || date.includes('8/9') || date.includes('8/09')) {
                                cardId = 'salaya_0809';
                            } else if (date.includes('02') || date.includes('03') || date.includes('3/9') || date.includes('3/09') || item.includes('อารีย์')) {
                                cardId = 'salaya_0309';
                            } else {
                                cardId = 'salaya_0209';
                            }
                        }

                        const reportObj = {
                            cardId: cardId,
                            date: resultJson.date,
                            item: resultJson.item,
                            weight: resultJson.weight,
                            freight: resultJson.freight,
                            payment: resultJson.payment,
                            location: resultJson.location,
                            receivedYield: resultJson.receivedYield,
                            receivedPrice: resultJson.receivedPrice,
                            receivedCondition: resultJson.receivedCondition,
                            receivedSize: resultJson.receivedSize,
                            rawText: text
                        };

                        recordLoadingReport(reportObj);

                        const factText = \`[รายงานทาง Telegram] วันที่ \${reportObj.date}: \${reportObj.item} น้ำหนัก \${reportObj.weight} สภาพ: \${reportObj.receivedCondition}\`;
                        memoryEngine.rememberItem(factText, 'learned_facts');

                        let reply = \`✅ <b>[AI สกัดข้อมูลสำเร็จและบันทึกลงระบบแล้วค่ะ!]</b>\\n\`;
                        reply += \`──────────────────\\n\`;
                        reply += \`📅 <b>วันที่:</b> \${reportObj.date || '-'}\\n\`;
                        reply += \`🥬 <b>รายการ:</b> \${reportObj.item || '-'}\\n\`;
                        if (reportObj.weight) reply += \`⚖️ <b>น้ำหนัก:</b> \${reportObj.weight}\\n\`;
                        if (reportObj.freight) reply += \`🚛 <b>ค่ารถ:</b> \${reportObj.freight}\\n\`;
                        if (reportObj.payment) reply += \`💵 <b>การชำระ:</b> \${reportObj.payment}\\n\`;
                        if (reportObj.location) reply += \`📍 <b>สถานที่:</b> \${reportObj.location}\\n\`;
                        if (reportObj.receivedYield) reply += \`📈 <b>Yield:</b> \${reportObj.receivedYield}%\\n\`;
                        if (reportObj.receivedPrice) reply += \`💰 <b>ราคา:</b> \${reportObj.receivedPrice} บ./กก.\\n\`;
                        if (reportObj.receivedSize) reply += \`📦 <b>ขนาด:</b> \${reportObj.receivedSize}\\n\`;
                        if (reportObj.receivedCondition) reply += \`🔍 <b>สภาพ:</b> \${reportObj.receivedCondition}\\n\`;
                        reply += \`──────────────────\\n\`;
                        reply += \`✨ ข้อมูลถูกแสดงบนตารางใน Dashboard เรียบร้อยแล้วค่ะ\`;

                        sendMessage(chatId, reply);
                    } else {
                        sendMessage(chatId, '❌ [AI Error]: ' + JSON.stringify(parsed));
                    }
                } catch(e) {
                    sendMessage(chatId, '❌ [AI Error]: ' + e.message);
                }
            });
        });
        req.on('error', (e) => sendMessage(chatId, '❌ [Network Error]: ' + e.message));
        req.write(postData);
        req.end();

        return;
    }`;

// Replace everything inside the `if (isReportPattern)` block up to `return;\n    }`
let blockStart = content.indexOf('    if (isReportPattern) {\r\n');
if (blockStart === -1) blockStart = content.indexOf('    if (isReportPattern) {\n');

let blockEnd = content.indexOf('        return;\r\n    }', blockStart);
if (blockEnd === -1) blockEnd = content.indexOf('        return;\n    }', blockStart);

if (blockStart > -1 && blockEnd > -1) {
    // Add 18 chars to include `        return;\r\n    }` or 17 chars for `\n`
    let endStr = content.substring(blockEnd, blockEnd + 20);
    let matchLen = endStr.includes('\r\n') ? 21 : 19;
    
    let originalBlock = content.substring(blockStart, blockEnd + matchLen);
    content = content.replace(originalBlock, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Successfully patched bot.js!');
} else {
    console.log('Could not find block boundaries.', blockStart, blockEnd);
}
