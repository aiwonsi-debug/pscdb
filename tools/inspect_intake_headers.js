const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/home/ubuntu/pscdb/intake_headers_probe.json', 'utf8'));
for (const sheet of data.sheets || []) {
  const title = sheet.properties && sheet.properties.title;
  console.log('SHEET', title);
  const rows = (((sheet.data || [])[0] || {}).rowData || []).map(r =>
    (r.values || []).map(v => v.formattedValue ?? v.effectiveValue?.stringValue ?? v.effectiveValue?.numberValue ?? '')
  );
  rows.slice(0, 12).forEach((r, i) => console.log(i + 1, JSON.stringify(r)));
}
