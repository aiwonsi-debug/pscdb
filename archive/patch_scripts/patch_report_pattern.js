const fs = require('fs');
let code = fs.readFileSync('E:/agy/bot.js', 'utf8');

const targetPattern = `    const isReportPattern = !hasNegation && (
        (text.startsWith('รายงานขึ้นของ') || text.startsWith('ขึ้นของ')) ||
        ((text.includes('ขึ้นกะหล่ำ') || text.includes('ขึ้นหอม') || text.includes('ขึ้นพริก') || text.includes('ขึ้นมะละกอ')) && (text.includes('น้ำหนักสุทธิ') || text.includes('เก็บปลายทาง')))
    );`;

const newPattern = `    const isReportPattern = !hasNegation && (
        text.startsWith('รายงานขึ้นของ') || text.startsWith('ขึ้นของ') ||
        text.includes('กะหล่ำเข้า') || text.includes('หอมเข้า') || text.includes('พริกเข้า') || text.includes('รับเข้า') ||
        ((text.includes('ขึ้นกะหล่ำ') || text.includes('ขึ้นหอม') || text.includes('ขึ้นพริก') || text.includes('ขึ้นมะละกอ') || text.includes('กะหล่ำ') || text.includes('หอม')) && 
         (text.includes('น้ำหนักสุทธิ') || text.includes('เก็บปลายทาง') || text.includes('จำนวนที่ได้รับ') || text.includes('สุ่มปอก') || text.includes('ปอกได้')))
    );`;

if (code.includes(targetPattern)) {
    code = code.replace(targetPattern, newPattern);
    fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
    console.log('Successfully updated isReportPattern in bot.js');
} else {
    console.log('Target pattern not found in bot.js');
}
