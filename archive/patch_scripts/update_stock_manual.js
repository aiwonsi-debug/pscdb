const fs = require('fs');
const file = 'E:/agy/stock_inventory.json';
const stock = JSON.parse(fs.readFileSync(file, 'utf8'));

stock.Items.Cabbage.StockKg = 2575;
stock.Items.Onion_AFT.StockKg = 26120;
stock.Items.Onion_Chinese.StockKg = 3560;
stock.Items.Carrot.StockKg = 5840;
stock.Items.Purple_Sweet_Potato.StockKg = 1690;
stock.Items.Yellow_Sweet_Potato.StockKg = 342;
stock.Items.Orange_Sweet_Potato.StockKg = 390;

fs.writeFileSync(file, JSON.stringify(stock, null, 2), 'utf8');

// Also update render-dashboard
const renderFile = 'E:/agy/render-dashboard/stock_inventory.json';
if (fs.existsSync(renderFile)) {
    fs.writeFileSync(renderFile, JSON.stringify(stock, null, 2), 'utf8');
}
console.log('Stock updated.');
