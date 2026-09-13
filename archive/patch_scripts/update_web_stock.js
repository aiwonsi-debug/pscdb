const fs = require('fs');

const updateHtml = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(
    /?? ?????????????????????? \([^)]+\) & ????????/g,
    '?? ?????????????????????? (08/09/69) & ????????'
  );
  content = content.replace(
    /???????????: [^<]+?\./g,
    '???????????: 08/09/69 09:11 ?.'
  );

  content = content.replace(
    /<span style="font-weight: 700; color: #3391b8; font-size: 14px;" id="stk_val_cabbage">[^<]+<\/span>/g,
    '<span style="font-weight: 700; color: #3391b8; font-size: 14px;" id="stk_val_cabbage">8,500 ??.</span>'
  );
  content = content.replace(
    /<span style="font-weight: 700; color: #10b981; font-size: 14px;" id="stk_val_onion_aft">[^<]+<\/span>/g,
    '<span style="font-weight: 700; color: #10b981; font-size: 14px;" id="stk_val_onion_aft">22,620 ??.</span>'
  );

  content = content.replace(
    /<span style="font-size:11px; color:#94a3b8;" id="audit_compare_label">[^<]+<\/span>/g,
    '<span style="font-size:11px; color:#94a3b8;" id="audit_compare_label">08/09/69 ???????? 07/09/69</span>'
  );

  content = content.replace(
    /<th style="padding:6px 8px; text-align:right;">05\/09 \(????\)<\/th>\s*<th style="padding:6px 8px; text-align:right;">07\/09 \(??????\)<\/th>/g,
    '<th style="padding:6px 8px; text-align:right;">07/09 (????)</th>\n                  <th style="padding:6px 8px; text-align:right;">08/09 (??????)</th>'
  );

  const newTbody = `<tbody id="stock_compare_tbody">
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px 8px;">?? ?????????</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">12,500 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">8,500 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#f59e0b;">-4,000 ??.</td>
                </tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px 8px;">?? ??? AFT</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">22,340 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">22,620 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#10b981;">+280 ??.</td>
                </tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px 8px;">?? ??????</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">7,010 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">7,010 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#94a3b8;">0 ??.</td>
                </tr>
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:6px 8px;">?? ????????</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">4,090 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">4,090 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#94a3b8;">0 ??.</td>
                </tr>
                <tr>
                  <td style="padding:6px 8px;">?? ??????????????</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">1,690 ??.</td>
                  <td style="padding:6px 8px; text-align:right; font-weight:700; color:#38bdf8;">1,690 ??.</td>
                  <td style="padding:6px 8px; text-align:right; color:#94a3b8;">0 ??.</td>
                </tr>
              </tbody>`;

  content = content.replace(/<tbody id="stock_compare_tbody">[\s\S]*?<\/tbody>/, newTbody);

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated:', filePath);
};

updateHtml('E:/agy/public/ops.html');
updateHtml('E:/agy/render-dashboard/public/ops.html');
