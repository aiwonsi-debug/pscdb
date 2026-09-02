const fs = require('fs');
const path = require('path');

const targetDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO\\Aug.1';
const outImgDir = path.join(__dirname, 'extracted_po_images');

if (!fs.existsSync(outImgDir)) fs.mkdirSync(outImgDir, { recursive: true });

// Extract JPEG streams from PDF files
function extractJpegsFromPdf(pdfPath, prefix) {
    const buf = fs.readFileSync(pdfPath);
    const saved = [];
    let count = 0;
    
    // Search for JPEG markers 0xFF 0xD8 0xFF ... 0xFF 0xD9
    let i = 0;
    while (i < buf.length - 10) {
        if (buf[i] === 0xFF && buf[i+1] === 0xD8 && buf[i+2] === 0xFF) {
            // Found JPEG start
            const start = i;
            let end = -1;
            for (let j = start + 2; j < buf.length - 1; j++) {
                if (buf[j] === 0xFF && buf[j+1] === 0xD9) {
                    end = j + 2;
                    break;
                }
            }
            if (end !== -1 && (end - start) > 10000) { // filter tiny thumbnails < 10KB
                count++;
                const imgName = `${prefix}_page${count}.jpg`;
                const imgPath = path.join(outImgDir, imgName);
                fs.writeFileSync(imgPath, buf.slice(start, end));
                saved.push(imgPath);
                i = end;
                continue;
            }
        }
        i++;
    }
    return saved;
}

const files = fs.readdirSync(targetDir).filter(f => f.endsWith('.pdf') && !f.startsWith('id') && !f.includes('PAISARN') && !f.includes('Record'));

console.log(`Extracting images from ${files.length} primary PDF files...`);

const allExtracted = {};

files.forEach(file => {
    const pdfPath = path.join(targetDir, file);
    const prefix = path.basename(file, '.pdf').replace(/[\s\-_]+/g, '_');
    const imgs = extractJpegsFromPdf(pdfPath, prefix);
    allExtracted[file] = imgs;
    console.log(`- ${file}: Extracted ${imgs.length} page images.`);
});

console.log(`\nTotal images extracted: ${Object.values(allExtracted).flat().length}`);
