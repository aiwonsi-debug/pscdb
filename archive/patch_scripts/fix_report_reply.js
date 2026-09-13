const fs = require('fs');

let file = 'E:/agy/bot.js';
let content = fs.readFileSync(file, 'utf8');

// Replace the buggy reply block and add LINE notification
const oldStr = "`✨ อัปเดตข้อมูล \\\\ เรียบร้อยแล้วค่ะ\n  🌐 เช็กข้อมูลล่าสุดบนเว็บ: https://pscdb.onrender.com`;";

const newStr = "`✨ อัปเดตข้อมูล ${reportObj.item || 'รายงาน'} เรียบร้อยแล้วค่ะ\\n🌐 เช็กข้อมูลล่าสุดบนเว็บ: https://pscdb.onrender.com`;\n\n                        // ส่งแจ้งเตือนไปที่ LINE Group\n                        const lineNotifier = require('./line_notifier.js');\n                        let lineMsg = `📦 รายงานการขึ้นของ/รับเข้าใหม่\\n` + reply.replace(/<[^>]*>?/gm, '');\n                        lineNotifier.sendLineMessage(lineMsg).catch(e => console.error(e));";

if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed reply and added LINE notification.');
} else {
    // maybe it has \r\n ?
    const oldStr2 = "`✨ อัปเดตข้อมูล \\\\ เรียบร้อยแล้วค่ะ\r\n  🌐 เช็กข้อมูลล่าสุดบนเว็บ: https://pscdb.onrender.com`;";
    if (content.includes(oldStr2)) {
        content = content.replace(oldStr2, newStr);
        fs.writeFileSync(file, content, 'utf8');
        console.log('Fixed reply and added LINE notification (CRLF).');
    } else {
        console.log('Could not find the target string to replace!');
        // Let's print out what it actually is
        const lines = content.split('\n');
        for(let i=0; i<lines.length; i++) {
            if (lines[i].includes('https://pscdb.onrender.com')) {
                console.log(lines[i-1]);
                console.log(lines[i]);
                console.log(lines[i+1]);
            }
        }
    }
}
