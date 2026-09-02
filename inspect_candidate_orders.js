const fs = require('fs');
const parser = require('./tns_order_parser.js');

const candidates = [
    'E:\\รวมงาน\\งาน 25-26\\TNS\\PO\\2026\\Aug\\Order PSC.xlsx',
    'E:\\รวมงาน\\งาน 25-26\\TNS\\Order PSC.xlsx',
    'E:\\รวมงาน\\งาน 25-26\\Order PSC.xlsx'
];

candidates.forEach(c => {
    if (fs.existsSync(c)) {
        const st = fs.statSync(c);
        console.log(`\n========================================`);
        console.log(`File: ${c}`);
        console.log(`Size: ${st.size} bytes | Modified: ${st.mtime}`);
        const orders = parser.extractTNSOrders(c, '2026');
        const sheets = [...new Set(orders.map(o => o.sheet))];
        console.log(`Sheets in 2026: ${sheets.join(', ')}`);
        const shallots = orders.filter(o => o.product === 'หอมแดง');
        console.log(`Shallot orders count: ${shallots.length}`);
        console.table(shallots.slice(-10));
    }
});
