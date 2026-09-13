const fs = require('fs');
let file1 = 'E:/agy/team_ops_status.json';
let file2 = 'E:/agy/render-dashboard/team_ops_status.json';

function patchJson(file) {
    let data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.cards_state && data.cards_state.salaya_0209) {
        data.cards_state.salaya_0209.receivedPrice = 3;
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

patchJson(file1);
patchJson(file2);
console.log('JSON patched for price');
