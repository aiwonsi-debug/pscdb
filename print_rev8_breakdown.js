const fs = require('fs');
const parser = require('./tns_order_parser.js');

const file41 = 'E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\Aug\\Order PSC.xlsx';
console.log('Inspecting Order PSC.xlsx (Rev.8) from Email #41:');
const orders = parser.extractTNSOrders(file41, '2026');

const aug26 = orders.filter(o => o.sheet === 'Aug-26');
const productTotals = {};
aug26.forEach(o => {
    productTotals[o.product] = (productTotals[o.product] || 0) + o.qty;
});
console.log('\n--- Aug-26 Sheet Product Totals (Rev.8) ---');
console.log(JSON.stringify(productTotals, null, 2));

console.log('\n--- Daily Breakdown of Aug-26 Sheet in Rev.8 ---');
const byDate = {};
aug26.forEach(o => {
    if (!byDate[o.date]) byDate[o.date] = [];
    byDate[o.date].push(`${o.product} ${o.qty.toLocaleString()} ${o.unit}`);
});

Object.keys(byDate).sort().forEach(d => {
    console.log(`${d}: ${byDate[d].join(' | ')}`);
});
