const fs = require('fs');
const file = 'E:/agy/team_ops_status.json';
let d = JSON.parse(fs.readFileSync(file, 'utf8'));

// Fix the corrupted string
d.cards_state.salaya_0209.loadedItem = 'กะหล่ำปลี เฮียหนิง';
d.cards_state.salaya_0209.loadedWeight = '8,715 kg (รับเข้า 8,500 kg)';
d.cards_state.salaya_0209.loadedFreight = '13,000บาท';
d.cards_state.salaya_0209.loadedPayment = 'เก็บปลายทาง 13,000 บาท';
d.cards_state.salaya_0209.loadedLocation = 'ขึ้นที่โกดัง  อมพาย แม่สะเรียง';
d.cards_state.salaya_0209.rawReport = 'วันที่ 01/09/26\nขึ้นกะหล่ำปลีเฮียหนิง\nน้ำหนักสุทธิ =8,715kg\n\nค่ารถ 13,000บาท\nเก็บปลายทาง 13,000 บาท\n(ขึ้นที่โกดัง  อมพาย แม่สะเรียง)';

fs.writeFileSync(file, JSON.stringify(d, null, 2), 'utf8');

const rFile = 'E:/agy/render-dashboard/team_ops_status.json';
if (fs.existsSync(rFile)) {
  fs.writeFileSync(rFile, JSON.stringify(d, null, 2), 'utf8');
}
console.log('Fixed JSON');