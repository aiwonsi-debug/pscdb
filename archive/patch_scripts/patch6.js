const fs = require('fs');
const file = 'E:/agy/Alert-TNSPreparation.ps1';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '3  { $stageBadge = "🚨 [ D-3 : เตรียมสั่งวัตถุดิบ (สั่งตัดเข้าโรงงานเตรียมส่งมอบ) ]"; $stageAction = "เตรียมสั่งวัตถุดิบ: สั่งตัดและรับเข้าวัตถุดิบเข้าโรงงาน เพื่อเตรียมคัดแต่งบรรจุส่งมอบ TNS" }',
  '3  { $stageBadge = "🚨 [ D-3 : เตรียมสั่งวัตถุดิบ (สั่งตัดเข้าโรงงานเตรียมส่งมอบ) ]"; $stageAction = "เตรียมสั่งวัตถุดิบ: สั่งตัดและรับเข้าวัตถุดิบเข้าโรงงาน เพื่อเตรียมคัดแต่งบรรจุส่งมอบ TNS" }\n            2  { $stageBadge = "🚨 [ D-2 : แจ้งเตือนสั่งหอมแดงก่อนวันขึ้นของ 1 วัน ]"; $stageAction = "แจ้งเตือนสั่งหอมแดง: ติดต่อป้าผาเพื่อสั่งหอมแดงก่อนขึ้นของพรุ่งนี้" }'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Done 6');
