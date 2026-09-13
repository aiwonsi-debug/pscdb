const fs = require('fs');
let code = fs.readFileSync('E:/agy/bot.js', 'utf8');

// Find start of isStockPattern
const stockPatternIdx = code.indexOf('const isStockPattern = !hasNegation &&');
const postReportIdx = code.indexOf('else {\n        // 4. Default Direct Route', stockPatternIdx);

if (stockPatternIdx !== -1 && postReportIdx !== -1) {
    const unifiedParserCode = `    // =========================================================================
    // 🌟 UNIFIED AI PARSER (STOCK, INTAKE, LOADING & YIELD IN A SINGLE ENGINE)
    // =========================================================================
    const isOpsOrStockPattern = !hasNegation && (
        text.includes('สต็อก') || text.includes('สต๊อก') || text.toLowerCase().includes('stock') ||
        text.includes('ขึ้นของ') || text.includes('รับเข้า') || text.includes('ขึ้นกะหล่ำ') ||
        text.includes('ขึ้นหอม') || text.includes('กะหล่ำเข้า') || text.includes('หอมเข้า') ||
        text.includes('สุ่มปอก') || text.includes('ปอกได้') || text.includes('จำนวนที่ได้รับ') ||
        text.includes('น้ำหนักสุทธิ') || text.includes('เก็บปลายทาง') || text.includes('ค่ารถ') ||
        text.includes('ราคา') || (text.includes('กก.') && (text.includes('บ.') || text.includes('บาท')))
    );

    if (isOpsOrStockPattern) {
        sendMessage(chatId, '🔄 [AI Unified Engine]: กำลังวิเคราะห์และอัปเดตระบบแบบครบวงจร...');
        sendChatAction(chatId, 'typing');

        const systemPrompt = \`คุณคือระบบสกัดข้อมูลอัตโนมัติ PSC Operations สกัดข้อมูลจากข้อความภาษาไทยลงฟอร์แมต JSON เท่านั้น
รูปแบบ JSON ที่ต้องส่งกลับ:
{
  "type": "INTAKE_OR_REPORT", // หรือ "STOCK_UPDATE" หรือ "BOTH"
  "date": "วันที่ (เช่น 03/09/69)",
  "supplier": "ชื่อสวน/ผู้ขาย (เช่น เฮียหนิง, เจ๊อารีย์, ป้าผา, เฮียบุญชู)",
  "location": "สถานที่ (เช่น โกดัง อมพาย แม่สะเรียง, ฮอด)",
  "item": "ชื่อสินค้า (เช่น กะหล่ำปลี, หอมแดง, พริกหวาน, แครอท)",
  "weight_kg": 8725, // ตัวเลขน้ำหนักตัวเลขล้วน (กก.) ถ้าไม่มีให้ใส่ null
  "freight_baht": 13000, // ค่ารถตัวเลขล้วน ถ้าไม่มีให้ใส่ null
  "payment": "เงื่อนไขชำระเงิน (เช่น เก็บปลายทาง)",
  "size": "ขนาด (เช่น กลาง, เล็ก, ใหญ่)",
  "condition": "สภาพสินค้า (เช่น สภาพโดยรวมดี แมง+ราเล็กน้อย)",
  "sample_kg": 100, // น้ำหนักสุ่มปอก ตัวเลขล้วน ถ้าไม่มีให้ใส่ null
  "peeled_kg": 64.8, // น้ำหนักที่ปอกได้ ตัวเลขล้วน ถ้าไม่มีให้ใส่ null
  "yield_pct": 64.8, // เปอร์เซ็นต์ Yield หากมีข้อมูลสุ่มปอกให้คำนวณ (peeled_kg / sample_kg * 100)
  "price_per_kg": 3.0, // ราคาต่อ กก. ถ้ามี
  "stock_inventory": { // ถ้ามีการระบุยอดสต็อกคงเหลือ
    "Cabbage": null,
    "Onion_AFT": null,
    "Onion_Chinese": null,
    "Carrot": null,
    "Purple_Sweet_Potato": null,
    "Yellow_Sweet_Potato": null,
    "Orange_Sweet_Potato": null
  }
}
ห้ามมโนข้อมูล ถ้าช่องไหนไม่มีในข้อความให้ใส่ null ห้ามตอบข้อความอื่นนอกจาก JSON\`;

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
            },
            timeout: 20000
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(resData);
                    if (!parsed.choices || !parsed.choices[0] || !parsed.choices[0].message) {
                        sendMessage(chatId, '❌ [AI Error]: ไม่สามารถสกัดข้อมูลได้');
                        return;
                    }

                    const result = JSON.parse(parsed.choices[0].message.content.trim());
                    const { recordLoadingReport, syncToRender } = require('./webhook_server.js');
                    const lineNotifier = require('./line_notifier.js');

                    // 1. Process Stock Inventory Updates & Yield Auto-Calculation
                    const stockPath = path.join(agyBaseDir, 'stock_inventory.json');
                    let stock = {};
                    if (fs.existsSync(stockPath)) {
                        try { stock = JSON.parse(fs.readFileSync(stockPath, 'utf8').replace(/^\uFEFF/, '')); } catch(e){}
                    }
                    if (!stock.Items) stock.Items = {};

                    let stockUpdated = false;
                    let updatedKeys = [];

                    // Auto-calculate yield if sample given
                    let calcYield = result.yield_pct;
                    if (!calcYield && result.sample_kg && result.peeled_kg && result.sample_kg > 0) {
                        calcYield = Number(((result.peeled_kg / result.sample_kg) * 100).toFixed(2));
                    }

                    if (calcYield && (result.item || '').includes('กะหล่ำ')) {
                        if (!stock.Items.Cabbage) stock.Items.Cabbage = { Name: "กะหล่ำปลี", StockKg: 6075 };
                        if (!stock.Items.Cabbage.Yield) stock.Items.Cabbage.Yield = {};
                        stock.Items.Cabbage.Yield.AFT = calcYield / 100;
                        stockUpdated = true;
                        updatedKeys.push(\`Yield กะหล่ำ AFT = \${calcYield}%\`);
                    }

                    if (result.stock_inventory) {
                        const inv = result.stock_inventory;
                        const keyMap = {
                            Cabbage: 'กะหล่ำปลี',
                            Onion_AFT: 'หอม AFT',
                            Onion_Chinese: 'หอมจีน',
                            Carrot: 'แครอท',
                            Purple_Sweet_Potato: 'มันม่วง',
                            Yellow_Sweet_Potato: 'มันเหลืองไข่',
                            Orange_Sweet_Potato: 'มันส้ม'
                        };
                        Object.keys(keyMap).forEach(k => {
                            if (inv[k] !== null && inv[k] !== undefined) {
                                if (!stock.Items[k]) stock.Items[k] = { Name: keyMap[k], StockKg: 0 };
                                stock.Items[k].StockKg = inv[k];
                                stockUpdated = true;
                                updatedKeys.push(\`\${keyMap[k]} = \${inv[k].toLocaleString()} kg\`);
                            }
                        });
                    }

                    if (stockUpdated) {
                        stock.LastUpdated = new Date().toISOString();
                        if (result.date) stock.AsOfDate = result.date;
                        fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2), 'utf8');
                        try { fs.writeFileSync(path.join(agyBaseDir, 'render-dashboard', 'stock_inventory.json'), JSON.stringify(stock, null, 2), 'utf8'); } catch(e){}
                        syncToRender('/api/stock-update', stock);
                    }

                    // 2. Process Operations / Intake / Loading Report
                    let cardId = 'salaya_0309';
                    const rawText = text;
                    const dateStr = result.date || '';
                    if (rawText.includes('หอมแดง')) {
                        cardId = (dateStr.includes('21') || dateStr.includes('20')) ? 'tns_shallot_2109' : 'tns_shallot_0709';
                    } else if (rawText.includes('พริก')) {
                        cardId = 'tns_pepper_1609';
                    } else if (dateStr.includes('07') || dateStr.includes('08')) {
                        cardId = 'salaya_0809';
                    } else if (dateStr.includes('01') || dateStr.includes('02')) {
                        cardId = 'salaya_0209';
                    }

                    const weightFormatted = result.weight_kg ? (result.weight_kg.toLocaleString() + ' kg') : '';
                    const freightFormatted = result.freight_baht ? (result.freight_baht.toLocaleString() + ' บาท') : '';

                    const reportObj = {
                        cardId: cardId,
                        date: result.date || formatDMY(),
                        item: result.item ? (\`\${result.item} (\${result.supplier || 'สวน'})\`) : 'รับเข้าวัตถุดิบ',
                        weight: weightFormatted,
                        freight: freightFormatted,
                        payment: result.payment || '',
                        location: result.location || '',
                        receivedYield: calcYield || null,
                        receivedPrice: result.price_per_kg || null,
                        receivedCondition: result.condition || '',
                        receivedSize: result.size || '',
                        rawText: text
                    };

                    recordLoadingReport(reportObj);

                    // 3. Update Cabbage Prices Transport Log if relevant
                    if ((result.item || '').includes('กะหล่ำ')) {
                        const cpPath = path.join(agyBaseDir, 'cabbage_prices_transport.json');
                        if (fs.existsSync(cpPath)) {
                            try {
                                let cp = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
                                if (cp.ShipmentHistory) {
                                    cp.ShipmentHistory.push({
                                        BatchId: 'CB-' + Date.now().toString().slice(-6),
                                        Supplier: result.supplier || 'เฮียหนิง',
                                        Location: result.location || 'อมพาย แม่สะเรียง',
                                        IntakeDate: result.date || formatDMY(),
                                        NetReceivedKg: result.weight_kg || 0,
                                        SampleTest: { sampleKg: result.sample_kg || 100, peeledKg: result.peeled_kg || 0, actualYield: (calcYield ? calcYield/100 : null) },
                                        Notes: text
                                    });
                                    fs.writeFileSync(cpPath, JSON.stringify(cp, null, 2), 'utf8');
                                    try { fs.writeFileSync(path.join(agyBaseDir, 'render-dashboard', 'cabbage_prices_transport.json'), JSON.stringify(cp, null, 2), 'utf8'); } catch(e){}
                                }
                            } catch(e){}
                        }
                    }

                    // 4. Construct Clear Bot Response & LINE Push
                    let reply = \`✅ <b>[ระบบบันทึกและซิงก์ข้อมูลอัตโนมัติสำเร็จ]</b>\\n\`;
                    reply += \`──────────────────\\n\`;
                    if (result.date) reply += \`📅 <b>วันที่:</b> \${result.date}\\n\`;
                    if (result.item || result.supplier) reply += \`🥬 <b>รายการ:</b> \${result.item || 'ผัก'} (\${result.supplier || 'ไม่ระบุสวน'})\\n\`;
                    if (result.weight_kg) reply += \`⚖️ <b>น้ำหนัก:</b> \${result.weight_kg.toLocaleString()} กก.\\n\`;
                    if (calcYield) reply += \`📈 <b>Yield (สุ่มปอก):</b> \${calcYield}%\\n\`;
                    if (result.size) reply += \`📦 <b>ขนาด:</b> \${result.size}\\n\`;
                    if (result.condition) reply += \`🔍 <b>สภาพ:</b> \${result.condition}\\n\`;
                    if (result.freight_baht) reply += \`🚛 <b>ค่ารถ:</b> \${result.freight_baht.toLocaleString()} บาท (\${result.payment || 'เก็บปลายทาง'})\\n\`;
                    if (result.location) reply += \`📍 <b>สถานที่:</b> \${result.location}\\n\`;

                    if (stockUpdated) {
                        reply += \`──────────────────\\n\`;
                        reply += \`📦 <b>อัปเดตสต็อก/Yield ในระบบ:</b>\\n\`;
                        updatedKeys.forEach(k => { reply += \`• \${k}\\n\`; });
                    }

                    reply += \`──────────────────\\n\`;
                    reply += \`🌐 <i>ข้อมูลถูกซิงก์ขึ้นเว็บและแจ้งเตือนเข้ากลุ่ม LINE เรียบร้อย</i>\\nhttps://pscdb.onrender.com\`;

                    sendMessage(chatId, reply);

                    // Send LINE Alert
                    const lineText = \`📢 [อัปเดตงาน PSC \${result.date || formatDMY()}]\\n\` +
                                     \`• \${result.item || 'วัตถุดิบ'} \${result.supplier ? '(' + result.supplier + ')' : ''}\\n\` +
                                     (result.weight_kg ? \`• น้ำหนัก: \${result.weight_kg.toLocaleString()} kg\\n\` : '') +
                                     (calcYield ? \`• Yield: \${calcYield}%\\n\` : '') +
                                     (result.condition ? \`• สภาพ: \${result.condition}\\n\` : '') +
                                     \`\\n🌐 ดูรายละเอียดสด: https://pscdb.onrender.com\`;
                    lineNotifier.sendLineMessage(lineText).catch(e => {});

                } catch(e) {
                    console.error('[Unified Parser Error]:', e);
                    sendMessage(chatId, '❌ [Processing Error]: ' + e.message);
                }
            });
        });

        req.on('error', (e) => sendMessage(chatId, '❌ [Network Error]: ' + e.message));
        req.write(postData);
        req.end();
        return;
    }
`;

    code = code.substring(0, stockPatternIdx) + unifiedParserCode + code.substring(postReportIdx);
    fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
    console.log('Successfully replaced parser with Unified Engine in bot.js');
} else {
    console.log('Index not found in bot.js');
}
