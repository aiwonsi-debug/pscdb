const fs = require('fs');
let file = 'E:/agy/bot.js';
let content = fs.readFileSync(file, 'utf8');

// I will just use regex to replace it
content = content.replace(/reply \+= `✨ อัปเดตข้อมูล \\\\[\s\S]*?https:\/\/pscdb\.onrender\.com`;/g, 
"reply += `✨ อัปเดตข้อมูล ${reportObj.item || 'รายงาน'} เรียบร้อยแล้วค่ะ\\n🌐 เช็กข้อมูลล่าสุดบนเว็บ: https://pscdb.onrender.com`;\n\n                        const lineNotifier = require('./line_notifier.js');\n                        let lineMsg = `📦 บันทึกข้อมูลขึ้นของ/รับเข้าใหม่\\n` + reply.replace(/<[^>]*>?/gm, '');\n                        lineNotifier.sendLineMessage(lineMsg).catch(e => console.error(e));");

fs.writeFileSync(file, content, 'utf8');
console.log('Regex patch applied!');
