const fs = require('fs');
const path = require('path');

const targetDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO\\Aug.1';
const files = fs.readdirSync(targetDir);

console.log(`Checking ${files.length} files in ${targetDir}:\n`);

files.forEach(file => {
    const filePath = path.join(targetDir, file);
    if (file.endsWith('.pdf')) {
        const buf = fs.readFileSync(filePath);
        const str = buf.toString('binary');
        const hasFont = str.includes('/Font');
        const hasImage = str.includes('/Image');
        console.log(`- ${file.padEnd(35)} | Font: ${hasFont} | Image: ${hasImage} | Size: ${(buf.length/1024).toFixed(1)} KB`);
    } else if (file.endsWith('.xlsx') || file.endsWith('.xls')) {
        console.log(`- ${file.padEnd(35)} | Excel Spreadsheet`);
    }
});
