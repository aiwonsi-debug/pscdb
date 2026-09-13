const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function exportStockExcel() {
  const jsonPath = path.join(__dirname, 'stock_inventory.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('File not found:', jsonPath);
    return;
  }
  const stockData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Sheet 1: Current Stock
  const currentStockRows = [
    ['????????????????? PSC (PSC Stock Inventory)', '', '', ''],
    ['?????? ? ??????:', stockData.AsOfDate || '', '????????????:', stockData.LastUpdated || new Date().toISOString()],
    [''],
    ['?????????? (Item Key)', '?????????? (Item Name)', '??????????????? (??.)', '???????? / Yield']
  ];

  for (const [key, item] of Object.entries(stockData.Items || {})) {
    let note = '';
    if (item.Yield) {
      note = 'Yield: ' + Object.entries(item.Yield).map(([k, v]) => `${k}=${v * 100}%`).join(', ');
    }
    currentStockRows.push([key, item.Name, item.StockKg, note]);
  }

  const wsCurrent = XLSX.utils.aoa_to_sheet(currentStockRows);
  wsCurrent['!cols'] = [{ wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 30 }];

  // Sheet 2: Recent Audits
  const auditSummaryRows = [
    ['?????????????????????????? (Recent Stock Audits)', '', '', '', '', '', ''],
    ['?????????', '?????????', '????????? (??.)', '??? AFT (??.)', '?????? (??.)', '???????? (??.)', '?????????????? (??.)']
  ];

  (stockData.RecentAudits || []).forEach(audit => {
    auditSummaryRows.push([
      audit.AsOfDate || '',
      audit.Label || '',
      audit.Items?.Cabbage ?? '',
      audit.Items?.Onion_AFT ?? '',
      audit.Items?.Onion_Chinese ?? '',
      audit.Items?.Carrot ?? '',
      audit.Items?.Purple_Sweet_Potato ?? ''
    ]);
  });

  const wsAudits = XLSX.utils.aoa_to_sheet(auditSummaryRows);
  wsAudits['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }];

  // Sheet 3: Audit Trail Log
  const logRows = [
    ['???-?????????? (Timestamp)', '?????? / ??????', '?????????? (Details / Value)', '?????????????? (Source)']
  ];

  (stockData.AuditTrail || []).forEach(log => {
    const details = log.Details || (log.NewKg !== undefined ? '???????: ' + log.NewKg + ' kg' : (log.NewValue !== undefined ? log.Field + ' -> ' + log.NewValue : ''));
    logRows.push([
      log.Timestamp || '',
      log.Item || log.ItemName || log.ItemKey || '',
      details,
      log.Source || ''
    ]);
  });

  const wsLog = XLSX.utils.aoa_to_sheet(logRows);
  wsLog['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 60 }, { wch: 35 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsCurrent, '?????????????');
  XLSX.utils.book_append_sheet(wb, wsAudits, '???????????????');
  XLSX.utils.book_append_sheet(wb, wsLog, '????????????????');

  const outPath1 = path.join(__dirname, 'stock_inventory.xlsx');
  XLSX.writeFile(wb, outPath1);

  const backupDir = 'E:/??????/??? 25-26';
  if (fs.existsSync(backupDir)) {
    const outPath2 = path.join(backupDir, 'stock_inventory.xlsx');
    XLSX.writeFile(wb, outPath2);
  }
  console.log('Stock Excel successfully synchronized.');
}

if (require.main === module) {
  exportStockExcel();
}

module.exports = { exportStockExcel };
