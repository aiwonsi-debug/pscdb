const fs = require('fs');
const file = 'E:/agy/Alert-TNSPreparation.ps1';
let content = fs.readFileSync(file, 'utf8');

const regex = /if\s*\(\$targetStages\s*-contains\s*\$daysLeft\)\s*\{/s;
const replacementStr = `
    $isTarget = $targetStages -contains $daysLeft
    $isShallotSpecial = ($daysLeft -eq 2)

    if ($isTarget -or $isShallotSpecial) {
        if ($order.Product -eq "หอมแดง" -and $daysLeft -ne 2) { continue }
        if ($order.Product -ne "หอมแดง" -and $daysLeft -eq 2) { continue }
`;
content = content.replace(regex, replacementStr);

const regex2 = /switch \(\$daysLeft\) \{[\s\S]*?3\s*\{\s*\$stageBadge.*?\n\s*\}/;
const actTarget = `switch ($daysLeft) {
            20 { $stageBadge = "📋 [ D-20 : เตรียมสั่งวัตถุดิบ (สำรวจแหล่งและจองยอด) ]"; $stageAction = "เตรียมสั่งวัตถุดิบล่วงหน้า: ประสานงานแหล่งปลูก/ซัพพลายเออร์ สำรวจปริมาณผลผลิตและจองยอด" }
            10 { $stageBadge = "📞 [ D-10 : เตรียมสั่งวัตถุดิบ (ติดตามและยืนยันยอด) ]"; $stageAction = "เตรียมสั่งวัตถุดิบ: ติดตามยืนยันยอดสั่งซื้อวัตถุดิบกับสวน/ผู้จำหน่าย ตรวจสอบความพร้อมจัดส่ง" }
            5  { $stageBadge = "🚚 [ D-5 : เตรียมสั่งวัตถุดิบ (คอนเฟิร์มวันขึ้นของและรถขนส่ง) ]"; $stageAction = "เตรียมสั่งวัตถุดิบ: ยืนยันการสั่งซื้อ นัดหมายวันขึ้นของ และจองคิวรถขนส่งห้องเย็น" }
            3  { $stageBadge = "🚨 [ D-3 : เตรียมสั่งวัตถุดิบ (สั่งตัดเข้าโรงงานเตรียมส่งมอบ) ]"; $stageAction = "เตรียมสั่งวัตถุดิบ: สั่งตัดและรับเข้าวัตถุดิบเข้าโรงงาน เพื่อเตรียมคัดแต่งบรรจุส่งมอบ TNS" }
            2  { $stageBadge = "🚨 [ D-2 : แจ้งเตือนสั่งหอมแดงก่อนวันขึ้นของ 1 วัน ]"; $stageAction = "แจ้งเตือนสั่งหอมแดง: ติดต่อป้าผาเพื่อสั่งหอมแดงก่อนขึ้นของพรุ่งนี้" }
        }`;
content = content.replace(regex2, actTarget);

fs.writeFileSync(file, content, 'utf8');
console.log('Replaced PS1 correctly');
