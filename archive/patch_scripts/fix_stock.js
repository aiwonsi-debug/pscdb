const fs = require('fs');

let file1 = 'E:/agy/stock_inventory.json';
let file2 = 'E:/agy/render-dashboard/stock_inventory.json';

function fixFile(file) {
    let data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.Items.Cabbage.Name = 'กะหล่ำปลี';
    data.Items.Onion_AFT.Name = 'หอม AFT';
    data.Items.Onion_Chinese.Name = 'หอมจีน';
    data.Items.Carrot.Name = 'แครอทสวย';
    data.Items.Purple_Sweet_Potato.Name = 'มันม่วงหัวเล็ก';
    data.Items.Yellow_Sweet_Potato.Name = 'มันเหลืองไข่';
    data.Items.Orange_Sweet_Potato.Name = 'มันส้ม';
    
    data.Items.Cabbage.StockKg = 11075;
    data.Items.Cabbage.Yield.AFT = 0.748;

    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

fixFile(file1);
fixFile(file2);
