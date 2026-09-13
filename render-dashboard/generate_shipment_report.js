// generate_shipment_report.js
const fs = require('fs');
const path = 'team_ops_status.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const ops = data.active_operations || [];
// Sort by delivery_date (YYYY-MM-DD)
ops.sort((a, b) => new Date(a.delivery_date) - new Date(b.delivery_date));
let md = '# Shipment Report (sorted by delivery date)\n\n| ID | Delivery Date | Customer | Farm | Product | Qty (kg) | Truck | Status |\n|----|---------------|----------|------|---------|----------|-------|--------|\n';
ops.forEach(o => {
  md += `| ${o.id} | ${o.delivery_date} | ${o.customer} | ${o.farm} | ${o.product} | ${o.qty_kg} | ${o.truck} | ${o.status} |\n`;
});
fs.writeFileSync('shipment_report.md', md, 'utf8');
console.log('Report generated at shipment_report.md');
