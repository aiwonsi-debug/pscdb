const fs = require('fs');

const files = [
  'E:/agy/ops_mobile_web.html',
  'E:/agy/render-dashboard/ops_mobile_web.html'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    const targetStart = '<div class="card" style="border-left: 4px solid #10b981;">';
    const targetEnd = '<!-- SECTION: WEEKLY DELIVERY CALENDAR FOR EACH CUSTOMER -->';
    const idxStart = content.indexOf(targetStart);
    const idxEnd = content.indexOf(targetEnd);
    if (idxStart !== -1 && idxEnd !== -1) {
      content = content.substring(0, idxStart) + content.substring(idxEnd);
      fs.writeFileSync(file, content, 'utf8');
      console.log('Removed card in:', file);
    } else {
      console.log('Target not found in:', file);
    }
  }
});
