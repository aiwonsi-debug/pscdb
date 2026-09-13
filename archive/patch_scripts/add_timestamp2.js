const fs = require('fs');

function processHtml(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');
    
    // Replace using regex
    html = html.replace(
        /(<span class="badge badge-primary">.*?<\/span>\s*<\/div>)/i,
        '$1\n        <div style="font-size: 11px; color: #94a3b8; margin-bottom: 12px; margin-top: -4px;">🕒 อัปเดตล่าสุด: <span id="cal_last_update"><script>document.write(new Date(document.lastModified).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " น.");</script></span></div>'
    );

    fs.writeFileSync(filePath, html, 'utf8');
}

processHtml('E:/agy/ops_mobile_web.html');
processHtml('E:/agy/render-dashboard/ops_mobile_web.html');
console.log('Timestamp added via regex.');
