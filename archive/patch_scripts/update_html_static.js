const fs = require('fs');

function updateHtml(filePath) {
    if (!fs.existsSync(filePath)) return;
    let html = fs.readFileSync(filePath, 'utf8');

    // Update Header Date
    html = html.replace(
        /(id=["']stock_card_title["'][^>]*>).*?(<\/div>)/s,
        '$1📦 สต็อกตรวจนับจริงล่าสุด (11/09/69) & คาดการณ์$2'
    );
    html = html.replace(
        /(id=["']stock_as_of_badge["'][^>]*>).*?(<\/span>)/s,
        '$1อัปเดตสต็อก: 11/09/69 10:05 น.$2'
    );

    // Update Individual Stock Values
    html = html.replace(/(id=["']stk_val_cabbage["'][^>]*>).*?(<\/span>)/s, '$111,975 กก.$2');
    html = html.replace(/(id=["']stk_val_onion_aft["'][^>]*>).*?(<\/span>)/s, '$119,140 กก.$2');
    html = html.replace(/(id=["']stk_val_onion_chinese["'][^>]*>).*?(<\/span>)/s, '$15,440 กก.$2');
    html = html.replace(/(id=["']stk_val_carrot["'][^>]*>).*?(<\/span>)/s, '$13,950 กก.$2');
    html = html.replace(/(id=["']stk_val_purple_potato["'][^>]*>).*?(<\/span>)/s, '$11,690 กก.$2');

    // Update Comparison Header
    html = html.replace(
        /(id=["']audit_compare_label["'][^>]*>).*?(<\/span>)/s,
        '$111/09/69 เทียบกับ 10/09/69$2'
    );
    html = html.replace(
        /<th[^>]*>07\/09 \(เดิม\)<\/th>\s*<th[^>]*>08\/09 \(ล่าสุด\)<\/th>/s,
        '<th style="padding:6px 8px; text-align:right;">10/09 (เดิม)</th>\n                  <th style="padding:6px 8px; text-align:right;">11/09 (ล่าสุด)</th>'
    );

    // Update Comparison Table Body
    const newTbody = `<tbody id="stock_compare_tbody">
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px 8px;">🥬 กะหล่ำปลี</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">5,025 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">11,975 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#10b981;">+6,950 กก.</td>
                </tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px 8px;">🧅 หอม AFT</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">20,280 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">19,140 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#f59e0b;">-1,140 กก.</td>
                </tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px 8px;">🧅 หอมจีน</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">5,440 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">5,440 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#94a3b8;">0 กก.</td>
                </tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px 8px;">🥕 แครอทสวย</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">3,950 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">3,950 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#94a3b8;">0 กก.</td>
                </tr>
                <tr>
                  <td style="padding:6px 8px;">🍠 มันม่วงหัวเล็ก</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">1,690 กก.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">1,690 กก.</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">0 กก.</td>
                </tr>
              </tbody>`;

    html = html.replace(/<tbody id="stock_compare_tbody">[\s\S]*?<\/tbody>/, newTbody);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log('Successfully updated HTML:', filePath);
}

updateHtml('E:/agy/public/ops.html');
updateHtml('E:/agy/render-dashboard/public/ops.html');
