// ==========================================
// Google Apps Script for PSC Database Webhook
// ==========================================

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var result = {};
  
  if (data.length > 1) {
    var headers = data[0];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var id = row[0];
      if (id) {
        result[id] = {
          supplier: row[1] || '',
          truck: row[2] || '',
          orderChecked: row[3] === true || row[3] === 'TRUE',
          truckChecked: row[4] === true || row[4] === 'TRUE',
          updatedAt: row[5] || ''
        };
      }
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var payload = JSON.parse(e.postData.contents);
    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    
    // Check if headers exist
    if (data.length === 0 || data[0][0] !== 'id') {
      sheet.appendRow(['id', 'supplier', 'truck', 'orderChecked', 'truckChecked', 'updatedAt']);
      data = sheet.getDataRange().getValues();
    }
    
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(payload.id)) {
        rowIndex = i + 1;
        break;
      }
    }
    
    var now = new Date().toISOString();
    var rowValues = [
      payload.id,
      payload.supplier || '',
      payload.truck || '',
      payload.orderChecked ? true : false,
      payload.truckChecked ? true : false,
      now
    ];
    
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, 6).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, id: payload.id, updatedAt: now }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
