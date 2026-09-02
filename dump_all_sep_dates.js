const engine = require('E:/agy/excel_integrity_engine.js');
const res = engine.parseAndVerifySheet('E:/รวมงาน/งาน 25-26/TNS/PO/2026/SEP Order PSC.xlsx', 'Sep-26');

console.log('================== TNS DAILY ORDERS (Sep-26) ==================');
res.dailyOrders.forEach(r => {
    const itemStrs = r.items.map(it => `${it.product} ${it.qty.toLocaleString()} kg`);
    const dayTotal = r.items.reduce((s, it) => s + it.qty, 0);
    const dDMY = `${r.day.toString().padStart(2, '0')}/09/2569`;
    console.log(`• วันที่ ${dDMY} (Day ${r.day}): ${itemStrs.join(', ')} [รวม ${dayTotal.toLocaleString()} กก.]`);
});
