const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const XLSX = require('xlsx');

const baseDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO\\aug.2';
const imgDir = path.join(baseDir, 'ocr_extracted_images');

if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

function extractJpegsFromPdf(pdfPath, prefix) {
    const buf = fs.readFileSync(pdfPath);
    const saved = [];
    let count = 0;
    
    let i = 0;
    while (i < buf.length - 10) {
        if (buf[i] === 0xFF && buf[i+1] === 0xD8 && buf[i+2] === 0xFF) {
            const start = i;
            let end = -1;
            for (let j = start + 2; j < buf.length - 1; j++) {
                if (buf[j] === 0xFF && buf[j+1] === 0xD9) {
                    end = j + 2;
                    break;
                }
            }
            if (end !== -1 && (end - start) > 10000) {
                count++;
                const imgName = `${prefix}_p${count}.jpg`;
                const imgPath = path.join(imgDir, imgName);
                fs.writeFileSync(imgPath, buf.slice(start, end));
                saved.push({ imgPath, page: count });
                i = end;
                continue;
            }
        }
        i++;
    }
    return saved;
}

const pdfFiles = fs.readdirSync(baseDir).filter(f => f.toLowerCase().endsWith('.pdf'));
console.log(`Extracting images from ${pdfFiles.length} PDFs in aug.2...`);

const mapping = [];
pdfFiles.forEach(f => {
    const pdfPath = path.join(baseDir, f);
    const prefix = path.basename(f, '.pdf').replace(/[\s\-_]+/g, '_');
    const imgs = extractJpegsFromPdf(pdfPath, prefix);
    imgs.forEach(im => {
        mapping.push({ file: f, imgPath: im.imgPath, txtPath: im.imgPath.replace(/\.jpg$/, '.txt'), page: im.page });
    });
});

console.log(`Extracted ${mapping.length} images from PDFs.`);

// Create PS1 script with UTF-8 BOM
const psPath = path.join(baseDir, '_run_ocr.ps1');
const psScript = `
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage, ContentType = WindowsRuntime]

$getAwaiterBaseMethod = [WindowsRuntimeSystemExtensions].GetMember('GetAwaiter').Where({ $PSItem.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' }, 'First')[0]
function Await { param($AsyncTask, $ResultType) $getAwaiterBaseMethod.MakeGenericMethod($ResultType).Invoke($null, @($AsyncTask)).GetResult() }

$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$imageDir = Join-Path $PSScriptRoot "ocr_extracted_images"
$files = Get-ChildItem -Path $imageDir -Filter "*.jpg"

foreach ($file in $files) {
    $imagePath = $file.FullName
    $txtPath = [System.IO.Path]::ChangeExtension($imagePath, ".txt")
    if (Test-Path $txtPath) { continue }
    try {
        $storageFile = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
        $randomAccessStream = Await ($storageFile.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($randomAccessStream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $softwareBitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $ocrResult = Await ($ocrEngine.RecognizeAsync($softwareBitmap)) ([Windows.Media.Ocr.OcrResult])
        [System.IO.File]::WriteAllText($txtPath, $ocrResult.Text, [System.Text.Encoding]::UTF8)
        $randomAccessStream.Dispose()
    } catch {
        Write-Host "Error on $($file.Name): $_"
    }
}
Write-Host "OCR Done."
`;

fs.writeFileSync(psPath, '\ufeff' + psScript, 'utf8');
console.log('Running Windows Native OCR...');
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psPath}"`, { stdio: 'inherit' });

console.log('\nAnalyzing OCR outputs for Delivery Dates and Orders...');
const poResults = [];

mapping.forEach(m => {
    if (!fs.existsSync(m.txtPath)) return;
    const txt = fs.readFileSync(m.txtPath, 'utf8');
    
    // Find PO Numbers (e.g. 6908-2357, 6908-2175, 6907-2080, etc.)
    const poMatches = txt.match(/69\d{2}[-\s]?\d{4}/g) || [];
    const cleanPOs = [...new Set(poMatches.map(p => p.replace(/\s+/g, '-')))];
    const poNumber = cleanPOs.length > 0 ? cleanPOs.join(', ') : m.file.replace('.pdf', '');

    const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
    
    let deliveryDates = [];
    let items = [];

    lines.forEach((line, idx) => {
        // Match Delivery Date lines
        if (/delivery|กำหนดส่ง|ส่งของ|deliv/i.test(line) || /d\/c|date/i.test(line)) {
            const dts = line.match(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/g);
            if (dts) deliveryDates.push(...dts);
        }

        // Product names & quantities
        if (/cabbage|กะหล่ำ/i.test(line)) items.push('กะหล่ำปลี (Cabbage)');
        if (/carrot|แครอท/i.test(line)) items.push('แครอท (Carrot)');
        if (/onion|หอมหัวใหญ่/i.test(line)) items.push('หอมหัวใหญ่ (Onion)');
        if (/eggplant|มะเขือม่วง/i.test(line)) items.push('มะเขือม่วง (Eggplant)');
    });

    const allDates = txt.match(/\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/g) || [];
    
    // Select best delivery date
    let delivDate = '-';
    if (deliveryDates.length > 0) {
        delivDate = deliveryDates[0];
    } else if (allDates.length > 0) {
        delivDate = allDates[allDates.length - 1];
    }

    poResults.push({
        'Source File': m.file,
        'Page': m.page,
        'PO Number': poNumber,
        'Delivery Date': delivDate,
        'All Found Dates': [...new Set(allDates)].join(', '),
        'Detected Items': [...new Set(items)].join(', ') || 'ผักสด / วัตถุดิบ',
        'Raw Snippet': txt.slice(0, 150).replace(/\s+/g, ' ')
    });
});

console.log(`\n=== EXTRACTED PO DELIVERY DATES (${poResults.length} pages) ===`);
console.table(poResults.map(r => ({
    File: r['Source File'],
    PO: r['PO Number'],
    'Delivery Date': r['Delivery Date'],
    Items: r['Detected Items']
})));

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(poResults);

ws['!cols'] = [
    { wch: 30 },
    { wch: 8 },
    { wch: 22 },
    { wch: 18 },
    { wch: 30 },
    { wch: 30 },
    { wch: 70 }
];

XLSX.utils.book_append_sheet(wb, ws, 'Yamamori_PO_Delivery_Dates');
const outExcel = path.join(baseDir, 'Yamamori_PO_Exact_Delivery_Dates.xlsx');
XLSX.writeFile(wb, outExcel);

console.log(`\n[SUCCESS] Created Exact Delivery Date list: ${outExcel}`);
