const fs = require('fs');
const file = 'E:/agy/cloud_secretary/modules/alertScheduler.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /if\s*\(tnsStages\.includes\(daysLeft\)\)\s*\{\s*for\s*\(const\s*item\s*of\s*ord\.items\)\s*\{\s*if\s*\(specialCrops\.includes\(item\.name\)\)\s*\{/s;

const replacementStr = `let isTarget = tnsStages.includes(daysLeft);
    let isShallotSpecial = (daysLeft === 2); // 1 day before loading (D-2 before delivery)

    if (isTarget || isShallotSpecial) {
      for (const item of ord.items) {
        if (specialCrops.includes(item.name)) {
          // Rule: Shallots alert ONLY at D-2
          if (item.name === 'หอมแดง' && daysLeft !== 2) continue;
          if (item.name !== 'หอมแดง' && daysLeft === 2) continue;`;

content = content.replace(regex, replacementStr);

const regex2 = /•[^\n]+/;
const actReplace = "• ${item.name === 'หอมแดง' ? '🚨 แจ้งเตือนสั่งหอมแดง (สั่งของก่อนวันขึ้นของ 1 วัน)' : 'เตรียมสั่งวัตถุดิบ (จัดหา ประสานงาน และสั่งซื้อวัตถุดิบ)'}";

content = content.replace(regex2, actReplace);

fs.writeFileSync(file, content, 'utf8');
console.log('Replaced JS');
