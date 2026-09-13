const fs = require('fs');
let file1 = 'E:/agy/ops_mobile_web.html';
let file2 = 'E:/agy/render-dashboard/ops_mobile_web.html';

function patchHtml(file) {
    let content = fs.readFileSync(file, 'utf8');

    content = content.replace(
        'loadedLocation: sItem.loadedLocation || lItem.loadedLocation\r\n          });',
        'loadedLocation: sItem.loadedLocation || lItem.loadedLocation,\r\n            receivedPrice: sItem.receivedPrice || lItem.receivedPrice,\r\n            receivedYield: sItem.receivedYield || lItem.receivedYield,\r\n            receivedCondition: sItem.receivedCondition || lItem.receivedCondition,\r\n            receivedSize: sItem.receivedSize || lItem.receivedSize\r\n          });'
    );
    // fallback
    content = content.replace(
        'loadedLocation: sItem.loadedLocation || lItem.loadedLocation\n          });',
        'loadedLocation: sItem.loadedLocation || lItem.loadedLocation,\n            receivedPrice: sItem.receivedPrice || lItem.receivedPrice,\n            receivedYield: sItem.receivedYield || lItem.receivedYield,\n            receivedCondition: sItem.receivedCondition || lItem.receivedCondition,\n            receivedSize: sItem.receivedSize || lItem.receivedSize\n          });'
    );

    content = content.replace(
        '<td><b style="color:#34d399;">${c.loadedWeight || (c.meta.qty_kg > 0 ? c.meta.qty_kg.toLocaleString() + \' kg\' : \'-\')}</b></td>',
        '<td>\n            <b style="color:#34d399;">${c.loadedWeight || (c.meta.qty_kg > 0 ? c.meta.qty_kg.toLocaleString() + \' kg\' : \'-\')}</b>\n            ${c.receivedYield ? `<div style="font-size:10.5px; color:#facc15; margin-top:2px;">Yield: ${c.receivedYield}%</div>` : \'\'}\n            ${c.receivedPrice ? `<div style="font-size:10.5px; color:#38bdf8;">${c.receivedPrice} บ./กก.</div>` : \'\'}\n          </td>'
    );

    content = content.replace(
        '<td><span style="color:#cbd5e1;">${c.loadedLocation || c.supplier}</span></td>',
        '<td>\n            <span style="color:#cbd5e1;">${c.loadedLocation || c.supplier}</span>\n            ${c.receivedSize ? `<div style="font-size:10.5px; color:#f8fafc; margin-top:2px;">ขนาด: ${c.receivedSize}</div>` : \'\'}\n            ${c.receivedCondition ? `<div style="font-size:10.5px; color:#a78bfa;">สภาพ: ${c.receivedCondition}</div>` : \'\'}\n          </td>'
    );

    fs.writeFileSync(file, content, 'utf8');
}

patchHtml(file1);
patchHtml(file2);
console.log('HTML patched');
