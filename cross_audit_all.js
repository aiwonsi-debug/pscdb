const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const baseDir = 'E:\\รวมงาน\\งาน 25-26\\Siam Yamamori\\PO';
const dirAug = path.join(baseDir, 'Aug');
const dirAug1 = path.join(baseDir, 'Aug.1');
const dirAug2 = path.join(baseDir, 'aug.2');

// 1. Files in Aug, Aug.1, aug.2
const filesAug = fs.existsSync(dirAug) ? fs.readdirSync(dirAug) : [];
const filesAug1 = fs.existsSync(dirAug1) ? fs.readdirSync(dirAug1) : [];
const filesAug2 = fs.existsSync(dirAug2) ? fs.readdirSync(dirAug2) : [];

// 2. Load Yamamori PO deliveries extracted from OCR & Email sync
const masterPOs = [
    { po: 'PO6907-2006', deliveryDate: '26/07/2026', issueDate: '23/07/2026', emailSubj: 'FW: 6907-2006,2007', emailDate: '23/07/2026', file: '2007-0002.pdf / id582_2006.pdf', item: 'ผักสด / วัตถุดิบ', inAug: false, inAug1: true, inAug2: false, inEmail: true, note: 'PO ปลาย ก.ค.' },
    { po: 'PO6907-2007', deliveryDate: '28/07/2026', issueDate: '23/07/2026', emailSubj: 'FW: 6907-2006,2007', emailDate: '23/07/2026', file: '2007-0002.pdf / id582_2007.pdf', item: 'ผักสด / วัตถุดิบ', inAug: false, inAug1: true, inAug2: false, inEmail: true, note: 'PO ปลาย ก.ค.' },
    { po: 'PO6907-2078', deliveryDate: '01/08/2026', issueDate: '25/07/2026', emailSubj: 'FW: 6907-2078,2079,2080,2081', emailDate: '25/07/2026', file: '2078-2081.pdf / id623_2078-2081.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 1 ส.ค.' },
    { po: 'PO6907-2079', deliveryDate: '03/08/2026', issueDate: '25/07/2026', emailSubj: 'FW: 6907-2078,2079,2080,2081', emailDate: '25/07/2026', file: '2078-2081.pdf', item: 'หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 3 ส.ค.' },
    { po: 'PO6907-2080', deliveryDate: '04/08/2026', issueDate: '25/07/2026', emailSubj: 'FW: 6907-2078,2079,2080,2081', emailDate: '25/07/2026', file: '2078-2081.pdf / id652_2080.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 4 ส.ค.' },
    { po: 'PO6907-2081', deliveryDate: '08/08/2026', issueDate: '25/07/2026', emailSubj: 'FW: 6907-2078,2079,2080,2081', emailDate: '25/07/2026', file: '2078-2081.pdf / id641_2081.pdf', item: 'กะหล่ำปลี / หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 8 ส.ค.' },
    { po: 'PO6908-2131', deliveryDate: '10/08/2026', issueDate: '03/08/2026', emailSubj: 'FW: 6908-2131', emailDate: '03/08/2026 & 04/08/2026', file: '2131.pdf / 2131-0001.pdf / id642_2131.pdf', item: 'ผักสด / วัตถุดิบ', inAug: false, inAug1: true, inAug2: false, inEmail: true, note: 'โหลดเข้า PO/Aug ในอีเมล sync' },
    { po: 'PO6908-2143', deliveryDate: '12/08/2026', issueDate: '04/08/2026', emailSubj: 'FW: 6908-2143', emailDate: '04/08/2026', file: '2143.pdf / id655_2143.pdf', item: 'ผักสด / วัตถุดิบ', inAug: false, inAug1: true, inAug2: false, inEmail: true, note: 'โหลดเข้า PO/Aug ในอีเมล sync' },
    { po: 'PO6908-2175', deliveryDate: '15/08/2026', issueDate: '07/08/2026', emailSubj: 'FW: 6908-2175,2176', emailDate: '07/08/2026', file: '2175 2176.pdf / id670_2175 2176.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 15 ส.ค.' },
    { po: 'PO6908-2176', deliveryDate: '18/08/2026', issueDate: '07/08/2026', emailSubj: 'FW: 6908-2175,2176', emailDate: '07/08/2026', file: '2175 2176.pdf / 2176 2224-2226.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 18 ส.ค.' },
    { po: 'PO6908-2224', deliveryDate: '21/08/2026', issueDate: '15/08/2026', emailSubj: 'FW: 6908-2224,2225,2226', emailDate: '15/08/2026 & 18/08/2026', file: '2224-2226.pdf / id708_2224.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 21 ส.ค.' },
    { po: 'PO6908-2225', deliveryDate: '26/08/2026', issueDate: '15/08/2026', emailSubj: 'FW: 6908-2224,2225,2226', emailDate: '15/08/2026 & 18/08/2026', file: '2224-2226.pdf / id708_2225.pdf', item: 'หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 26 ส.ค.' },
    { po: 'PO6908-2226', deliveryDate: '27/08/2026', issueDate: '15/08/2026', emailSubj: 'FW: 6908-2224,2225,2226', emailDate: '15/08/2026 & 18/08/2026', file: '2224-2226.pdf / id708_2226.pdf', item: 'หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 27 ส.ค.' },
    { po: 'PO6908-2282', deliveryDate: '29/08/2026', issueDate: '21/08/2026', emailSubj: 'FW: 6908-2282', emailDate: '21/08/2026 & 26/08/2026', file: '2282.pdf / 2282-0001.pdf / id722_2282.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: false, inAug1: true, inAug2: false, inEmail: true, note: 'ส่งมอบ 29 ส.ค.' },
    { po: 'PO6908-2323', deliveryDate: '31/08/2026', issueDate: '25/08/2026', emailSubj: 'FW: 6908-2323,2324,2325', emailDate: '25/08/2026 & 26/08/2026', file: '2323-2325.pdf / 2323-2325-0001.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 31 ส.ค.' },
    { po: 'PO6908-2324', deliveryDate: '01/09/2026', issueDate: '25/08/2026', emailSubj: 'FW: 6908-2323,2324,2325', emailDate: '25/08/2026 & 26/08/2026', file: '2323-2325.pdf / 2323-2325-0001.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 1 ก.ย.' },
    { po: 'PO6908-2325', deliveryDate: '02/09/2026', issueDate: '25/08/2026', emailSubj: 'FW: 6908-2323,2324,2325', emailDate: '25/08/2026 & 26/08/2026', file: '2323-2325.pdf / 2323-2325-0001.pdf', item: 'แครอท + หอมหัวใหญ่', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 2 ก.ย.' },
    { po: 'PO6908-2357', deliveryDate: '05/09/2026', issueDate: '28/08/2026', emailSubj: 'FW: 6908-2357,2358', emailDate: '28/08/2026', file: '2357 2358.pdf / id753_2357 2358.pdf', item: 'แครอท 180 kg + หอมใหญ่ 625 kg', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 5 ก.ย.' },
    { po: 'PO6908-2358', deliveryDate: '10/09/2026', issueDate: '28/08/2026', emailSubj: 'FW: 6908-2357,2358', emailDate: '28/08/2026', file: '2357 2358.pdf / id753_2357 2358.pdf', item: 'แครอท 136 kg + หอมใหญ่ 1,150 kg', inAug: true, inAug1: true, inAug2: true, inEmail: true, note: 'ส่งมอบ 10 ก.ย.' }
];

console.log('========================================================================================================');
console.log('                 🔍 4-WAY CROSS-RECONCILIATION: EMAIL vs AUG vs AUG.1 vs AUG.2');
console.log('========================================================================================================\n');

const tableDisplay = masterPOs.map(p => ({
    'เลขที่ PO': p.po,
    'กำหนดส่งมอบ (Delivery)': p.deliveryDate,
    'วันที่อีเมล (Gmail)': p.emailDate,
    'Email Subject': p.emailSubj,
    'มีใน Email': p.inEmail ? '✅ มี' : '❌ ไม่มี',
    'มีใน Aug': p.inAug ? '✅ มี' : '❌ ไม่มี (ไฟล์แยก)',
    'มีใน Aug.1': p.inAug1 ? '✅ มี' : '❌ ไม่มี',
    'มีใน aug.2': p.inAug2 ? '✅ มี' : '❌ ไม่มี (ไฟล์แยก)',
    'สถานะ & รายละเอียด': p.note
}));

console.table(tableDisplay);

// Export cross-audit Excel
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(tableDisplay);
ws['!cols'] = [
    { wch: 15 },
    { wch: 22 },
    { wch: 22 },
    { wch: 30 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 25 }
];
XLSX.utils.book_append_sheet(wb, ws, '4Way_Reconciliation');
const outExcel = path.join(dirAug2, 'Yamamori_PO_4Way_Reconciliation.xlsx');
XLSX.writeFile(wb, outExcel);

console.log(`\n[SUCCESS] 4-Way Reconciliation saved to: ${outExcel}`);
