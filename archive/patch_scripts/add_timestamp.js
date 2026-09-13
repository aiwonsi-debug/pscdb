const fs = require('fs');

function processHtml(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');
    
    // Find the header for the calendar
    const searchString = '<span class="badge badge-primary">กันยายน 2569</span>\r\n        </div>';
    const replaceString = '<span class="badge badge-primary">กันยายน 2569</span>\n        </div>\n        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px; margin-top: -4px;">🕒 อัปเดตล่าสุด: <span id="cal_last_update"><script>document.write(new Date(document.lastModified).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " น.");</script></span></div>';
    
    // Check if using \n or \r\n
    if (html.includes(searchString)) {
        html = html.replace(searchString, replaceString);
    } else {
        const searchStringLF = '<span class="badge badge-primary">กันยายน 2569</span>\n        </div>';
        html = html.replace(searchStringLF, replaceString);
    }

    fs.writeFileSync(filePath, html, 'utf8');
}

processHtml('E:/agy/ops_mobile_web.html');
processHtml('E:/agy/render-dashboard/ops_mobile_web.html');
console.log('Timestamp added.');
