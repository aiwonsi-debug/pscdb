const fs = require('fs');
let code = fs.readFileSync('E:/agy/bot.js', 'utf8');

const targetIdx = code.indexOf('const isReportPattern = !hasNegation &&');
if (targetIdx !== -1) {
    const endIdx = code.indexOf('if (isReportPattern) {', targetIdx);
    const newCode = `const isReportPattern = !hasNegation && (
        text.startsWith('รายงานขึ้นของ') || text.startsWith('ขึ้นของ') ||
        text.includes('กะหล่ำเข้า') || text.includes('หอมเข้า') || text.includes('พริกเข้า') || text.includes('รับเข้า') || text.includes('สุ่มปอก') ||
        ((text.includes('ขึ้นกะหล่ำ') || text.includes('ขึ้นหอม') || text.includes('ขึ้นพริก') || text.includes('ขึ้นมะละกอ') || text.includes('กะหล่ำ') || text.includes('หอม')) && 
         (text.includes('น้ำหนักสุทธิ') || text.includes('เก็บปลายทาง') || text.includes('จำนวนที่ได้รับ') || text.includes('ปอกได้')))
    );\n\n    `;
    
    code = code.substring(0, targetIdx) + newCode + code.substring(endIdx);
    fs.writeFileSync('E:/agy/bot.js', code, 'utf8');
    console.log('Successfully patched bot.js isReportPattern via index');
} else {
    console.log('Index not found');
}
