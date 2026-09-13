const fs = require('fs');

function processHtml(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');

    const lines = html.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.includes('<br>• <span class="badge badge-salaya"')) {
            lines[i] = line.replace(/<br>• <span class="badge badge-salaya"/g, '<div class="inner-factory inner-aft">• <span class="badge badge-salaya"') + '</div>';
        }
        if (line.includes('<br>• <span class="badge badge-tns"')) {
            lines[i] = line.replace(/<br>• <span class="badge badge-tns"/g, '<div class="inner-factory inner-tns">• <span class="badge badge-tns"') + '</div>';
        }
        if (line.includes('<br>• <span class="badge badge-yamamori"')) {
            lines[i] = line.replace(/<br>• <span class="badge badge-yamamori"/g, '<div class="inner-factory inner-yamamori">• <span class="badge badge-yamamori"') + '</div>';
        }
        if (line.includes('<br> • <span class="badge badge-tns"')) {
            lines[i] = line.replace(/<br> • <span class="badge badge-tns"/g, '<div class="inner-factory inner-tns">• <span class="badge badge-tns"') + '</div>';
        }
    }
    html = lines.join('\n');
    
    let filterFunc = `
      function filterCalCustomer(cust, element) {
        const btns = ['btn_cal_all', 'btn_cal_aft', 'btn_cal_tns', 'btn_cal_yamamori'];
        btns.forEach(b => {
          const el = document.getElementById(b);
          if (el) el.classList.remove('active');
        });
        if (element) element.classList.add('active');
  
        const items = document.querySelectorAll('.cal-event-item');
        items.forEach(it => {
          if (cust === 'all') {
            it.style.display = 'block';
          } else {
            it.style.display = it.classList.contains('cal-' + cust) ? 'block' : 'none';
          }
        });

        const innerItems = document.querySelectorAll('.inner-factory');
        innerItems.forEach(it => {
            if (cust === 'all') {
                it.style.display = 'block';
            } else {
                it.style.display = it.classList.contains('inner-' + cust) ? 'block' : 'none';
            }
        });
      }
    `;

    const oldStart = html.indexOf('function filterCalCustomer(cust, element) {');
    const oldEnd = html.indexOf('function switchAppTab(tabId) {');
    if (oldStart !== -1 && oldEnd !== -1) {
        html = html.substring(0, oldStart) + filterFunc.trim() + '\n\n      ' + html.substring(oldEnd);
    }

    fs.writeFileSync(filePath, html, 'utf8');
}

processHtml('E:/agy/ops_mobile_web.html');
processHtml('E:/agy/render-dashboard/ops_mobile_web.html');
console.log('HTML updated.');
