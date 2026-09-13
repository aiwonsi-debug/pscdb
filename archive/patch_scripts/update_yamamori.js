const fs = require('fs');
function processHtml(filePath) {
    let html = fs.readFileSync(filePath, 'utf8');
    const lines = html.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.includes('<br>• <span class="badge badge-warning" style="font-size:9.5px;">Yamamori</span>')) {
            lines[i] = line.replace(/<br>• <span class="badge badge-warning" style="font-size:9.5px;">Yamamori<\/span>/g, '<div class="inner-factory inner-yamamori">• <span class="badge badge-warning" style="font-size:9.5px;">Yamamori</span>') + '</div>';
        }
    }
    html = lines.join('\n');
    fs.writeFileSync(filePath, html, 'utf8');
}
processHtml('E:/agy/ops_mobile_web.html');
processHtml('E:/agy/render-dashboard/ops_mobile_web.html');
console.log('HTML updated.');
