const fs = require('fs');
const file = 'E:/agy/cloud_secretary/modules/alertScheduler.js';
let content = fs.readFileSync(file, 'utf8');

const targetStr = 'if (tnsStages.includes(daysLeft)) {\n      for (const item of ord.items) {\n        if (specialCrops.includes(item.name)) {\n          const lockKey = TNS___D-_;';

const replacementStr = 'let isTarget = tnsStages.includes(daysLeft);\n    let isShallotSpecial = (daysLeft === 2); // 1 day before loading (D-2 before delivery)\n\n    if (isTarget || isShallotSpecial) {\n      for (const item of ord.items) {\n        if (specialCrops.includes(item.name)) {\n          // Rule: Shallots (หอมแดง) alert ONLY at D-2\n          if (item.name === \'หอมแดง\' && daysLeft !== 2) continue;\n          if (item.name !== \'หอมแดง\' && daysLeft === 2) continue;\n\n          const lockKey = TNS___D-_;';

content = content.replace(targetStr, replacementStr);

const actTarget = '• เตรียมสั่งวัตถุดิบ (จัดหา ประสานงาน และสั่งซื้อวัตถุดิบจากแหล่งสวน/ซัพพลายเออร์)';
const actReplace = '• ';

content = content.replace(actTarget, actReplace);

fs.writeFileSync(file, content, 'utf8');
console.log('Done JS patch');
