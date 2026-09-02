const fs = require('fs');
const path = require('path');
const tnsEngine = require('./excel_integrity_engine.js');

console.log('================================================================');
console.log('      🔍 COMPREHENSIVE GROUND-TRUTH AUDIT: SEPTEMBER 2026');
console.log('================================================================\n');

// 1. AUDIT TNS (Thai Nisshin Seifun)
console.log('----------------------------------------------------------------');
console.log('1. CUSTOMER: TNS (Thai Nisshin Seifun Co., Ltd.)');
console.log('----------------------------------------------------------------');
let tnsGrandTotal = 0;
const tnsFile = 'E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\SEP Order PSC.xlsx';
try {
    const tnsResult = tnsEngine.parseAndVerifySheet(tnsFile, 'Sep-26');
    console.log(`Source File: ${tnsFile}`);
    console.log(`Sheet: ${tnsResult.sheetName} | Reconciliation: ${tnsResult.isReconciled ? '✅ 100% RECONCILED' : '❌ FAILED'}`);
    console.log('\nProduct Totals:');
    tnsResult.verificationReport.forEach(r => {
        if (r.calculatedSum > 0) {
            console.log(`  • [${r.code}] ${r.product}: ${r.calculatedSum.toLocaleString()} kg (Row 34 Total: ${r.row34Total.toLocaleString()} kg)`);
            tnsGrandTotal += r.calculatedSum;
        }
    });
    console.log(`  ➔ Total TNS Volume: ${tnsGrandTotal.toLocaleString()} kg across ${tnsResult.dailyOrders.length} delivery days`);
} catch(e) {
    console.error('TNS Error:', e.message);
}

// 2. AUDIT AFT (Ajinomoto Frozen Foods)
console.log('\n----------------------------------------------------------------');
console.log('2. CUSTOMER: AFT (Ajinomoto Frozen Foods Thailand)');
console.log('----------------------------------------------------------------');
const aftDeliveries = [
    { date: '2026-09-01', day: 1, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1500 }] },
    { date: '2026-09-02', day: 2, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1500 }] },
    { date: '2026-09-03', day: 3, items: [{ product: 'กะหล่ำปลี', qty: 3000 }, { product: 'หอมใหญ่ปอก', qty: 1100 }] },
    { date: '2026-09-04', day: 4, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1500 }] },
    { date: '2026-09-05', day: 5, items: [{ product: 'กะหล่ำปลี', qty: 2000 }, { product: 'หอมใหญ่ปอก', qty: 500 }, { product: 'แครอท', qty: 630 }] },
    { date: '2026-09-07', day: 7, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1500 }] },
    { date: '2026-09-08', day: 8, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1500 }] },
    { date: '2026-09-09', day: 9, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1500 }] },
    { date: '2026-09-10', day: 10, items: [{ product: 'กะหล่ำปลี', qty: 2000 }, { product: 'หอมใหญ่ปอก', qty: 2000 }] },
    { date: '2026-09-11', day: 11, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1500 }] },
    { date: '2026-09-12', day: 12, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1000 }, { product: 'แครอท', qty: 630 }] },
    { date: '2026-09-14', day: 14, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1000 }, { product: 'แครอท', qty: 450 }] },
    { date: '2026-09-15', day: 15, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1000 }] },
    { date: '2026-09-16', day: 16, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1000 }] },
    { date: '2026-09-17', day: 17, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1000 }] },
    { date: '2026-09-18', day: 18, items: [{ product: 'กะหล่ำปลี', qty: 2400 }, { product: 'หอมใหญ่ปอก', qty: 1000 }, { product: 'แครอท', qty: 450 }] },
    { date: '2026-09-21', day: 21, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1000 }] },
    { date: '2026-09-22', day: 22, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1000 }] },
    { date: '2026-09-23', day: 23, items: [{ product: 'กะหล่ำปลี', qty: 2500 }, { product: 'หอมใหญ่ปอก', qty: 1000 }] },
    { date: '2026-09-26', day: 26, items: [{ product: 'กะหล่ำปลี', qty: 3500 }, { product: 'หอมใหญ่ปอก', qty: 700 }, { product: 'แครอท', qty: 470 }] }
];

let aftTotals = { 'กะหล่ำปลี': 0, 'หอมใหญ่ปอก': 0, 'แครอท': 0 };
aftDeliveries.forEach(d => {
    d.items.forEach(it => {
        aftTotals[it.product] = (aftTotals[it.product] || 0) + it.qty;
    });
});

console.log('Source: Email Attachment & Purchasing Plan Sep 2026 (Rev.00)');
console.log('AFT Monthly Totals:');
let aftGrandTotal = 0;
for (const [p, qty] of Object.entries(aftTotals)) {
    console.log(`  • ${p}: ${qty.toLocaleString()} kg`);
    aftGrandTotal += qty;
}
console.log(`  ➔ Total AFT Volume: ${aftGrandTotal.toLocaleString()} kg (20 delivery days)`);

// 3. AUDIT SIAM YAMAMORI
console.log('\n----------------------------------------------------------------');
console.log('3. CUSTOMER: Siam Yamamori Co., Ltd.');
console.log('----------------------------------------------------------------');
const yamamoriPOs = [
    {
        poNumber: 'PO6908-2357',
        deliveryDate: '2026-09-05',
        gtAlertDate: '2026-09-03 (D-2 วันทำการ)',
        items: [
            { product: 'แครอท (Carrot)', qty: 180, unitPrice: 28.00, amount: 5040.00 },
            { product: 'หอมหัวใหญ่ (Onion)', qty: 625, unitPrice: 33.12, amount: 20700.00 }
        ],
        totalAmount: 25740.00
    },
    {
        poNumber: 'PO6908-2358',
        deliveryDate: '2026-09-10',
        gtAlertDate: '2026-09-08 (D-2 วันทำการ)',
        items: [
            { product: 'แครอท (Carrot)', qty: 136, unitPrice: 28.00, amount: 3808.00 },
            { product: 'หอมหัวใหญ่ (Onion)', qty: 1150, unitPrice: 34.82, amount: 40040.00 }
        ],
        totalAmount: 43848.00
    }
];

console.log('Source: Siam Yamamori_2357 2358.pdf (Official POs)');
let yamamoriGrandKg = 0;
let yamamoriGrandBaht = 0;
yamamoriPOs.forEach(po => {
    console.log(`\n• ${po.poNumber} [ส่งมอบ ${po.deliveryDate} | เตือน GT: ${po.gtAlertDate}]:`);
    po.items.forEach(it => {
        console.log(`    - ${it.product}: ${it.qty} kg @ ${it.unitPrice} บ. = ${it.amount.toLocaleString()} บ.`);
        yamamoriGrandKg += it.qty;
    });
    console.log(`    ➔ ยอดรวม PO: ${po.totalAmount.toLocaleString()} บาท`);
    yamamoriGrandBaht += po.totalAmount;
});
console.log(`\n  ➔ Total Siam Yamamori Volume: ${yamamoriGrandKg.toLocaleString()} kg | Total Value: ${yamamoriGrandBaht.toLocaleString()} บาท`);

// 4. CHECK OISHI & OTHERS
console.log('\n----------------------------------------------------------------');
console.log('4. OTHER CUSTOMERS (Oishi, Makro, etc.)');
console.log('----------------------------------------------------------------');
console.log('• Oishi: ไม่มี PO รอบกันยายน 2569 ในระบบ (รอเอกสารจากฝ่ายจัดซื้อ)');
console.log('• Makro: เอกสารสำรวจแหล่งผลิต GAP (ยังไม่มีใบสั่งซื้อผักสดรอบกันยายน)');

// 5. GRAND SUMMARY
console.log('\n================================================================');
console.log('      📊 ALL CUSTOMERS COMBINED VOLUME (SEPTEMBER 2026)');
console.log('================================================================');
console.log(`1. TNS (Thai Nisshin Seifun):    ${tnsGrandTotal.toLocaleString()} kg`);
console.log(`2. AFT (Ajinomoto Frozen Foods): ${aftGrandTotal.toLocaleString()} kg`);
console.log(`3. Siam Yamamori:                 ${yamamoriGrandKg.toLocaleString()} kg (${yamamoriGrandBaht.toLocaleString()} บาท)`);
console.log(`----------------------------------------------------------------`);
console.log(`🌟 GRAND TOTAL SEPTEMBER VOLUME: ${(tnsGrandTotal + aftGrandTotal + yamamoriGrandKg).toLocaleString()} kg`);
console.log('================================================================\n');
