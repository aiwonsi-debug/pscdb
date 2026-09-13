const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

function formatPoDetailsForNotification(line) {
  // Line format from Fetch-GmailPO.ps1:
  // "[SAVED] Siam Yamamori : 2424 2425.pdf -> Sep/2026 (473306 bytes)" or "Siam Yamamori : 2424 2425.pdf -> Sep/2026 (473306 bytes)"
  const cleanLine = line.replace(/\[SAVED\]/i, '').trim();
  const match = cleanLine.match(/^([^:]+)\s*:\s*([^->]+)\s*->\s*([^\s(]+)/);
  if (!match) return '';
  const customer = match[1].trim();
  const filename = match[2].trim();
  const monthYear = match[3].trim();
  const targetMonth = monthYear.split('/')[0]; // e.g. "Sep"

  let details = '';

  if (customer.toLowerCase().includes('yamamori')) {
    const baseWorkDirs = ['E:/รวมงาน/งาน 25-26/Siam Yamamori/PO', 'E:/งาน 25-26/Siam Yamamori/PO'];
    const goods = ['carrot.xlsx', 'onion.xlsx', 'eggplant.xlsx'];
    const results = [];
    
    for (const b of baseWorkDirs) {
      if (!fs.existsSync(b)) continue;
      goods.forEach(g => {
        const p = path.join(b, g);
        if (fs.existsSync(p)) {
          try {
            const wb = xlsx.readFile(p);
            // Search only matching month sheet if it exists, otherwise check all
            const sheetsToCheck = wb.SheetNames.includes(targetMonth) ? [targetMonth] : wb.SheetNames;
              sheetsToCheck.forEach(sheet => {
                const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheet]);
                rows.forEach(r => {
                  if (!r.Source_File && !r.PO_Number) return;
                  const srcBase = r.Source_File ? path.basename(r.Source_File.toString().trim()) : '';
                  const poNum = (r.PO_Number || '').toString();
                  // Check exact match, partial match, or PO number matching digits in filename
                  const fileDigits = (filename.match(/\d{4}/g) || []);
                  const matchesDigits = fileDigits.length > 0 && fileDigits.some(d => poNum.includes(d));
                  if (srcBase === filename || srcBase.includes(filename) || matchesDigits) {
                    results.push(r);
                  }
                });
              });
          } catch(e) {}
        }
      });
      if (results.length > 0) break;
    }

    if (results.length > 0) {
      const byPO = {};
      results.forEach(r => {
        const po = r.PO_Number || 'PO';
        if (!byPO[po]) byPO[po] = [];
        byPO[po].push(r);
      });

      for (const [po, items] of Object.entries(byPO)) {
        const dDate = items[0].Delivery_Date || items[0].Request_Date || '-';
        const isRevised = items.some(it => it.Source_File && it.Source_File.toString().toLowerCase().includes('rev'));
        const revTag = isRevised ? ' 🔴 [REVISED / แก้ไขยอด]' : '';
        details += `  📦 ${po}${revTag} (กำหนดส่ง: ${dDate})\n`;
        let subtotal = 0;
        items.forEach(it => {
          const q = Number(it.Quantity) || 0;
          const u = it.Unit || 'kg';
          const p = Number(it.Unit_Price) || 0;
          const a = Number(it.Amount) || (q * p);
          subtotal += a;
          const itemName = it.Item_Description || it.Item_Code;
          details += `    • ${itemName}: ${q.toLocaleString()} ${u} (@${p}฿) = ${a.toLocaleString()} ฿\n`;
        });
        details += `    💰 รวม: ${subtotal.toLocaleString()} บาท\n`;
      }
    }
  } else if (customer.toUpperCase().includes('TNS')) {
    details += `  📦 ตารางจัดส่ง TNS งวด ${monthYear}\n`;
  } else if (customer.toUpperCase().includes('AFT')) {
    details += `  📦 แผนการสั่งซื้อ AFT งวด ${monthYear}\n`;
  }

  return details;
}

module.exports = { formatPoDetailsForNotification };

if (require.main === module) {
  const sample = 'Siam Yamamori : 2424 2425.pdf -> Sep/2026 (473306 bytes)';
  console.log('Sample output:\n' + formatPoDetailsForNotification(sample));
}
