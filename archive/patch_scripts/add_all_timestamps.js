const fs = require('fs');

const files = [
  'E:/agy/ops_mobile_web.html',
  'E:/agy/render-dashboard/ops_mobile_web.html'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let html = fs.readFileSync(file, 'utf8');

    // 1. Header brand - Add System Last Updated timestamp
    html = html.replace(
      '<p>บจก.ไพศาลเจริญ (1988)</p>',
      '<p>บจก.ไพศาลเจริญ (1988) <span style="display:inline-block; margin-left:6px; background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; font-size:10px; color:#9e9689;">🕒 ซิงก์ระบบ: <span id="sys_sync_time">03/09/69 15:43 น.</span></span></p>'
    );

    // 2. Section Ops Card: ตารางขึ้นของสวน & สั่งรถ
    html = html.replace(
      '<span class="badge badge-warning">Live Sync</span>',
      '<span class="badge badge-warning" id="ops_sync_badge">อัปเดตล่าสุด: 03/09/69 15:43 น.</span>'
    );

    // 3. Section Stock: ราคาวัตถุดิบ & ค่าขนส่งล่าสุด
    html = html.replace(
      '<span class="badge badge-success">อัปเดต ณ 03/09/69</span>',
      '<span class="badge badge-success" id="price_sync_badge">อัปเดตราคา: 03/09/69 12:23 น.</span>'
    );

    // 4. Section Stock: ตารางบันทึกการส่งของ
    html = html.replace(
      '<span class="badge badge-success" id="log_count_badge">0 รายการ</span>',
      '<span class="badge badge-success" id="log_count_badge">0 รายการ (อัปเดต: 03/09/69 15:43 น.)</span>'
    );

    // 5. Section Stock: Stock ตรวจนับจริง
    html = html.replace(
      '<span class="badge badge-success" id="stock_as_of_badge">อัปเดต ณ 02/09/69</span>',
      '<span class="badge badge-success" id="stock_as_of_badge">อัปเดตสต็อก: 03/09/69 15:43 น.</span>'
    );

    // 6. Section Calendar: ปฏิทินรอบส่งมอบ
    html = html.replace(
      '<span class="badge badge-primary">กันยายน 2569</span>',
      '<span class="badge badge-primary">กันยายน 2569 (อัปเดต: 03/09/69 13:00 น.)</span>'
    );

    // 7. Enhance JS live fetch to dynamically update the stock timestamp
    const oldFetchJs = "if (data.AsOfDate && document.getElementById('stock_as_of_badge')) document.getElementById('stock_as_of_badge').textContent = 'อัปเดต ณ ' + data.AsOfDate;";
    const newFetchJs = `if (document.getElementById('stock_as_of_badge')) {
            const timeStr = data.LastUpdated ? new Date(data.LastUpdated).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '15:43';
            document.getElementById('stock_as_of_badge').textContent = 'อัปเดตสต็อก: ' + (data.AsOfDate || '03/09/69') + ' ' + timeStr + ' น.';
          }`;
    html = html.replace(oldFetchJs, newFetchJs);

    // 8. Dynamic live update time for Ops sync
    const oldOpsJs = "serverCardsState = data.cards_state;";
    const newOpsJs = `serverCardsState = data.cards_state;
            if (document.getElementById('ops_sync_badge')) {
              const now = new Date();
              const timeStr = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
              document.getElementById('ops_sync_badge').textContent = 'อัปเดตสด: 03/09/69 ' + timeStr + ' น.';
              if (document.getElementById('sys_sync_time')) document.getElementById('sys_sync_time').textContent = '03/09/69 ' + timeStr + ' น.';
            }`;
    html = html.replace(oldOpsJs, newOpsJs);

    fs.writeFileSync(file, html, 'utf8');
    console.log('Added timestamps to all sections in:', file);
  }
});
