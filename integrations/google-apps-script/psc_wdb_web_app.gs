/**
 * PSC WDB — LINE Reports to Google Sheets Web App (Standalone + Gemini AI)
 *
 * Install this file in the Apps Script project attached to the target Google Sheet:
 * "PSC WDB LINE Sync Database"
 *
 * Required Script Properties (Project Settings -> Script Properties):
 *   GEMINI_API_KEY            = AIzaSy... (Free API key from Google AI Studio)
 *   LINE_CHANNEL_ACCESS_TOKEN = ... (Channel Access Token from LINE Developers Console)
 *   LINE_ADMIN_USER_ID        = U... (Optional; admin LINE user ID for group-message push notifications)
 *   PSC_KEYWORD_PATTERN       = ... (Optional; custom regex or comma-separated keywords to override defaults)
 *
 * Deployment:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * โครงสร้างไฟล์ (บนลงล่าง):
 *   1. Config
 *   2. Entry points (doGet / doPost)
 *   3. LINE event handlers (ข้อความ / รูปภาพ)
 *   4. Gemini AI (แปลงข้อความ/รูปเป็น JSON)
 *   5. Sync ไปยัง Sheet ปลายทางอื่น (Farm Ops / Prices / Customer POs)
 *   6. LINE messaging (reply / push)
 *   7. Utilities ทั่วไป
 *   8. Setup / one-off tools
 */

// ===================== 1. CONFIG =====================

const REPORT_SHEET = 'LINE Reports';
const AUDIT_SHEET = 'LINE Sync Audit';
const MAX_RAW_TEXT_LENGTH = 12000;

const REPORT_HEADERS = [
  'syncJobId', 'reportId', 'source', 'messageId', 'rawText', 'reportType',
  'seller', 'item', 'origin', 'eventDate', 'quantityKg', 'gradeMediumKg',
  'gradeSmallKg', 'qualityNote', 'sampleKg', 'yieldKg', 'freightBaht',
  'paymentTerm', 'destination', 'receivedAt', 'syncedAt'
];

const AUDIT_HEADERS = [
  'receivedAt', 'status', 'reportId', 'syncJobId', 'messageId', 'detail'
];

// Canonical workbook collection: Drive folder 11L80cwOkWDEZJCxVD4SghI7zfrfwj9yL
// The .gsheet files in that folder are shortcuts; these are their underlying spreadsheet IDs.
// รวม Spreadsheet ID ของทุกไฟล์ปลายทางไว้ที่เดียว (เดิมประกาศซ้ำกระจายอยู่หลายฟังก์ชัน)
const PHYSICAL_STOCK_ID = "1LhS7R0GeFiQ4PR_2tXqVgkFRBYX3jXSvdC0yHiOEIEM"; // 3_Physical_Stock_and_Forecast.gsheet
const FARM_OPS_ID = "195Foz8mjcLt1q5agCh28FoyJkg4VxGhMt86XqX7ZSCM"; // 1_Farm_Ops_Transport_and_Intake.gsheet
const MATERIAL_PRICES_ID = "1-2n4Q2XYjGyRqoogAnS_Id1tGzUBq2bKHvHVKeXEYXM"; // 2_Material_Prices_and_Freight_Matrix.gsheet
const CUSTOMER_POS_ID = "1FfkSYTCxUFYj3dE6VHAOWEqDa4MVU3yMz7rwjefh-Ig"; // 4_Customer_POs_and_Delivery_Plans.gsheet


// ===================== 2. ENTRY POINTS =====================

/**
 * API สำหรับให้ pscdb.onrender.com และภายนอกเรียกดูข้อมูลสดตรงจาก Google Sheets ทุกแท็บ
 */
function doGet(e) {
  const param = (e && e.parameter) || {};
  const action = param.action || 'summary';

  try {
    // 1. ข้อมูลสต็อกปัจจุบัน
    const stockSs = SpreadsheetApp.openById(PHYSICAL_STOCK_ID);
    const cleanStock = stockSs.getSheetByName("Clean_Stock") || stockSs.getSheets()[0];
    const stockRows = cleanStock.getDataRange().getValues();
    const stockData = [];
    for (let i = 1; i < stockRows.length; i++) {
      if (stockRows[i][0] || stockRows[i][1]) {
        stockData.push({
          code: stockRows[i][0],
          name: stockRows[i][1],
          actualQtyKg: Number(stockRows[i][2]) || 0,
          readyQtyKg: Number(stockRows[i][3]) || 0,
          minReserveKg: Number(stockRows[i][4]) || 0,
          status: stockRows[i][5] || ''
        });
      }
    }

    // 2. ข้อมูลคิวงานสั่งรถล่วงหน้า
    const farmOpsSs = SpreadsheetApp.openById(FARM_OPS_ID);
    const cleanSched = farmOpsSs.getSheetByName("Clean_Schedules") || farmOpsSs.getSheets()[0];
    const schedRows = cleanSched.getDataRange().getValues();
    const scheduleData = [];
    for (let i = 1; i < schedRows.length; i++) {
      if (schedRows[i][0] || schedRows[i][1]) {
        scheduleData.push({
          jobId: schedRows[i][0],
          targetDate: schedRows[i][1],
          seller: schedRows[i][2],
          origin: schedRows[i][3],
          transporter: schedRows[i][4],
          detail: schedRows[i][5],
          qtyKg: Number(schedRows[i][6]) || 0,
          status: schedRows[i][7]
        });
      }
    }

    // 3. ยอดใช้รายวันจาก Customer PO / Daily Breakdown
    const customerPosSs = SpreadsheetApp.openById(CUSTOMER_POS_ID);
    const demandByDate = readCustomerPoDemand_(customerPosSs);

    // 4. ข้อมูลราคาวัตถุดิบและค่ารถ
    const priceSs = SpreadsheetApp.openById(MATERIAL_PRICES_ID);
    const cleanPrice = priceSs.getSheetByName("Clean_Material_Prices") || priceSs.getSheets()[0];
    const priceRows = cleanPrice.getDataRange().getValues();
    const priceData = [];
    for (let i = 1; i < priceRows.length; i++) {
      if (priceRows[i][0] || priceRows[i][1]) {
        priceData.push({
          date: priceRows[i][0],
          seller: priceRows[i][1],
          location: priceRows[i][2],
          variety: priceRows[i][3],
          pricePerKg: Number(priceRows[i][4]) || 0,
          truck4Cost: Number(priceRows[i][5]) || 0,
          truck6Cost: Number(priceRows[i][6]) || 0,
          transporter: priceRows[i][7],
          totalDeliveredCost6: Number(priceRows[i][8]) || 0,
          totalDeliveredCost4: Number(priceRows[i][9]) || 0,
          note: priceRows[i][10]
        });
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      service: 'PSC Live Sheets Data API (pscdb.onrender.com)',
      timestamp: new Date().toISOString(),
      stock: stockData,
      schedules: scheduleData,
      prices: priceData,
      demandByDate: demandByDate,
      demandSource: 'Customer PO daily breakdowns'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      error: String(err)
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/** Aggregate AFT, Siam Yamamori, and TNS daily PO sheets for the dashboard. */
function readCustomerPoDemand_(ss) {
  const out = {};
  const add = (dateValue, code, value) => {
    const date = normalizeDateKey_(dateValue);
    const qty = toKg_(value);
    if (!date || !qty) return;
    if (!out[date]) out[date] = {};
    out[date][code] = (out[date][code] || 0) + qty;
  };
  const read = (sheetName, mappings, headerRows) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const rows = sheet.getDataRange().getValues();
    for (let i = headerRows; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      mappings.forEach(m => add(row[0], m.code, row[m.column]));
    }
  };
  read('AFT Daily Breakdown (Sep 26)', [
    { code: 'Cabbage', column: 4 }, { code: 'Carrot', column: 5 }, { code: 'Onion_AFT', column: 8 }
  ], 3);
  read('Siam Yamamori Daily Breakdown (', [
    { code: 'Carrot', column: 2 }, { code: 'Onion_AFT', column: 3 }
  ], 3);
  read('TNS Daily Breakdown (Sep 26)', [
    { code: 'Onion_Chinese', column: 1 }, { code: 'Carrot', column: 3 },
    { code: 'Cabbage', column: 5 }, { code: 'Green_Pimento', column: 8 }
  ], 3);
  return out;
}

function toKg_(value) {
  if (typeof value === 'number') return value;
  const match = String(value == null ? '' : value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function normalizeDateKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const text = String(value == null ? '' : value).trim();
  const iso = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return iso[1] + '-' + ('0' + iso[2]).slice(-2) + '-' + ('0' + iso[3]).slice(-2);
  const dmy = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return dmy[3] + '-' + ('0' + dmy[2]).slice(-2) + '-' + ('0' + dmy[1]).slice(-2);
  return '';
}

function doPost(e) {
  const receivedAt = new Date();
  let body = {};

  try {
    body = parseBody_(e);

    // ตรวจจับคำสั่งส่งตรงจาก LINE Messaging API Webhook
    if (body.events) {
      // ตรวจสอบการกดปุ่ม Verify จาก LINE Developers Console (events ว่าง)
      if (!body.events || body.events.length === 0) {
        return json_({ ok: true, status: 'verified' });
      }

      // วนลูปประมวลผลข้อความจริงจาก LINE (ทั้งข้อความตัวอักษรและรูปภาพ PO)
      for (let i = 0; i < body.events.length; i++) {
        const ev = body.events[i];
        if (ev.type === 'message') {
          if (ev.message && ev.message.type === 'text') {
            handleLineDirectEvent_(ev, receivedAt);
          } else if (ev.message && ev.message.type === 'image') {
            handleLineImageEvent_(ev, receivedAt);
          }
        }
      }
      return json_({ ok: true, processed: body.events.length });
    }

    // หากไม่ใช่ LINE webhook events
    return json_({ ok: false, error: 'unsupported_event' });
  } catch (err) {
    auditBestEffort_([
      receivedAt, 'error', '', '', '',
      'doPost error: ' + String(err && err.message ? err.message : err)
    ]);
    return json_({ ok: false, error: 'server_error', detail: String(err) });
  }
}


// ===================== 3. LINE EVENT HANDLERS =====================

/**
 * ประมวลผลข้อความ LINE ตรงด้วย Gemini API และบันทึกลง Sheet
 */
/**
 * ดึง Regex สำหรับกรองข้อความสำคัญ โดยอ่านจาก Script Properties 'PSC_KEYWORD_PATTERN' ถ้ามีตั้งไว้
 */
function getKeyWordPattern_() {
  const customPattern = PropertiesService.getScriptProperties().getProperty('PSC_KEYWORD_PATTERN');
  if (customPattern && customPattern.trim()) {
    try {
      return new RegExp(customPattern.trim(), 'i');
    } catch (e) {
      Logger.log("Invalid custom regex pattern in PSC_KEYWORD_PATTERN: " + e);
    }
  }
  // Default Pattern ครอบคลุมชนิดสินค้า, สถานะงาน, สถานที่, และคู่ค้าหลัก
  return /(กะหล่ำ|หอม|แครอท|มันม่วง|มันส้ม|มันเหลือง|ผัก|สต็อก|stock|ขึ้นของ|ส่งมอบ|ยกเลิก|cancel|ราคา|ค่ารถ|บาท|พันธุ์ช้าง|สวน|ตัน|กก|โล|ถุง|ศาลายา|บ่อสลี|ป้าผา|เฮียหนิง|เจ๊อารีย์|เฮียบุญชู|เจ๊พรรณี|เฮียธงชัย|พี่บู้|พี่อั๋น|ปากคลอง|นิ่มซี่เส็ง|รถ|ทะเบียน|โรงงาน)/i;
}

/**
 * ประมวลผลข้อความ LINE ตรงด้วย Gemini API และบันทึกลง Sheet
 */
function handleLineDirectEvent_(event, receivedAt) {
  const rawText = (event.message && event.message.text) ? event.message.text.trim() : '';
  const messageId = String(event.message.id || '');
  const reportId = 'LINE-' + messageId;
  const syncJobId = 'direct-' + (receivedAt.getTime());

  if (!rawText) return;

  // กรองข้อความเบื้องต้น: ถ้าไม่มีคีย์เวิร์ดเกี่ยวกับงาน/สินค้าเลย (เช่น คุยเล่น, สวัสดี, ส่งสติกเกอร์) ให้เพิกเฉยทันที
  const keywordPattern = getKeyWordPattern_();
  if (!keywordPattern.test(rawText)) {
    Logger.log("Skipped casual message: " + rawText);
    return;
  }

  // 1. เรียก Gemini แปลงภาษาพูดเป็น JSON (ทำนอก Lock เพื่อไม่บล็อกคิวข้อความอื่น)
  const parsed = interpretWithGemini(rawText);
  // Receiving reports may include the supplier name immediately after the
  // product (for example รับกะหล่ำปลีเฮียหนิง). Keep this detection broad so
  // they can never fall through to the dispatch/schedule branch.
  const receivingText = /(?:รับ\s*(?:เข้า|ของ|กะหล่ำ|หอม|พริก)|สุ่ม\s*ปอก|ปอก\s*ได้)/i.test(rawText);
  if (parsed && receivingText) parsed.reportType = 'intake';
  if (!parsed || parsed.reportType === 'none') {
    Logger.log("Ignored non-report message: " + rawText);
    return;
  }

  // 2. ล็อคเฉพาะขั้นตอนการเขียนและซิงค์ชีต (Lock Scope ให้สั้นที่สุด)
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const reportSheet = ensureSheet_(ss, REPORT_SHEET, REPORT_HEADERS);
    const auditSheet = ensureSheet_(ss, AUDIT_SHEET, AUDIT_HEADERS);

    if (findDuplicate_(reportSheet, messageId, reportId)) {
      auditSheet.appendRow([receivedAt, 'duplicate', reportId, syncJobId, messageId, 'Direct LINE duplicate ignored']);
      return;
    }

    if (parsed.reportType === 'stock' && parsed.stockItems && parsed.stockItems.length > 0) {
      // 1. กรณีเป็นรายงานสต็อกสินค้าหลายรายการ
      for (let s = 0; s < parsed.stockItems.length; s++) {
        const itemObj = parsed.stockItems[s];
        const stockRow = {
          syncJobId: syncJobId,
          reportId: reportId + '-' + (s + 1),
          source: 'line_direct',
          messageId: messageId,
          rawText: rawText,
          reportType: 'stock',
          seller: '',
          item: itemObj.item || '',
          origin: '',
          eventDate: parsed.asOfDate || Utilities.formatDate(receivedAt, 'Asia/Bangkok', 'yyyy-MM-dd'),
          quantityKg: itemObj.quantityKg || '',
          gradeMediumKg: '',
          gradeSmallKg: '',
          qualityNote: 'สต็อกคงเหลือ',
          sampleKg: '',
          yieldKg: '',
          freightBaht: '',
          paymentTerm: '',
          destination: '',
          receivedAt: receivedAt.toISOString(),
          syncedAt: receivedAt
        };
        appendReportRow_(reportSheet, stockRow);
      }
      auditSheet.appendRow([receivedAt, 'accepted', reportId, syncJobId, messageId, 'Direct LINE stock report saved (' + parsed.stockItems.length + ' items)']);

      // ตอบกลับสรุปสต็อก (ถ้าในกลุ่มจะส่งหาแอดมินคนเดียว ไม่รบกวนกลุ่ม)
      let msg = '✅ [บันทึกรายงานสต็อก PSC เรียบร้อย]\n📅 วันที่: ' + (parsed.asOfDate || '-') + '\n';
      for (let s = 0; s < parsed.stockItems.length; s++) {
        const itemObj = parsed.stockItems[s];
        msg += '• ' + itemObj.item + ': ' + Number(itemObj.quantityKg || 0).toLocaleString() + ' กก.\n';
      }
      notifyResult_(event, msg.trim());

      // ซิงค์เฉพาะรายงานสต็อกเข้า 3_Physical_Stock_and_Forecast ทันที
      syncPhysicalStockToDrive_(parsed.stockItems, parsed.asOfDate);
    } else if (parsed.reportType === 'intake' && parsed.item) {
      // รายงานรับเข้า/รับของ: ห้ามสร้างงานใน Next Schedule ให้ลง Dispatch & Intake เท่านั้น
      const intakeRow = {
        syncJobId: syncJobId,
        reportId: reportId,
        source: 'line_direct',
        messageId: messageId,
        rawText: rawText,
        reportType: 'intake',
        seller: parsed.seller || '',
        item: parsed.item || '',
        origin: parsed.origin || '',
        eventDate: parsed.receivedDate || parsed.eventDate || Utilities.formatDate(receivedAt, 'Asia/Bangkok', 'yyyy-MM-dd'),
        quantityKg: parsed.quantityKg || '',
        gradeMediumKg: parsed.gradeMediumKg || '',
        gradeSmallKg: parsed.gradeSmallKg || '',
        qualityNote: parsed.qualityNote || '',
        sampleKg: parsed.sampleKg || '',
        yieldKg: parsed.yieldKg || '',
        freightBaht: parsed.freightBaht || '',
        paymentTerm: parsed.paymentTerm || '',
        destination: parsed.destination || '',
        receivedAt: receivedAt.toISOString(),
        syncedAt: receivedAt
      };
      appendReportRow_(reportSheet, intakeRow);
      auditSheet.appendRow([receivedAt, 'accepted', reportId, syncJobId, messageId, 'Direct LINE intake saved to Dispatch & Intake']);
      notifyResult_(event, '✅ [บันทึกรับเข้า/รับของ PSC เรียบร้อย]\n' +
        '🥬 สินค้า: ' + (parsed.item || '-') + '\n' +
        '⚖️ จำนวน: ' + (parsed.quantityKg ? Number(parsed.quantityKg).toLocaleString() + ' กก.' : '-') + '\n' +
        '📈 Yield: ' + (parsed.yieldKg || '-') + '\n' +
        '🏡 ผู้จำหน่าย: ' + (parsed.seller || '-'));
      try {
        appendFarmOpsTask_({
          receivedAt: receivedAt,
          scheduleRow: null,
          intakeRow: [
            '', '', intakeRow.eventDate, intakeRow.seller, intakeRow.origin,
            intakeRow.item, '', '', '', Number(parsed.quantityKg) || '', '',
            '', '', '', '', parsed.yieldKg ? Number(parsed.yieldKg) : '',
            [parsed.gradeMediumKg ? 'ขนาดกลาง-ใหญ่' : '', intakeRow.qualityNote,
              parsed.sampleKg ? 'สุ่มปอก ' + parsed.sampleKg + ' กก.' : '',
              parsed.yieldKg ? 'ปอกได้ ' + parsed.yieldKg + ' กก.' : '']
              .filter(function(v) { return v; }).join('; '),
            'รับเข้าเรียบร้อย', ''
          ]
        });
      } catch (fErr) {
        Logger.log('Direct intake sync to Dispatch & Intake error: ' + fErr);
      }
    } else if (parsed.reportType === 'dispatch' && parsed.item) {
      // 2. กรณีเป็นงานขึ้นของ / ขนส่งปกติ
      const rowData = {
        syncJobId: syncJobId,
        reportId: reportId,
        source: 'line_direct',
        messageId: messageId,
        rawText: rawText,
        reportType: 'dispatch',
        seller: parsed.seller || '',
        item: parsed.item || '',
        origin: parsed.origin || '',
        eventDate: parsed.loadingDate || parsed.eventDate || '',
        quantityKg: parsed.quantityKg || '',
        gradeMediumKg: parsed.gradeMediumKg || '',
        gradeSmallKg: parsed.gradeSmallKg || '',
        qualityNote: parsed.qualityNote || '',
        sampleKg: parsed.sampleKg || '',
        yieldKg: parsed.yieldKg || '',
        freightBaht: parsed.freightBaht || '',
        paymentTerm: parsed.paymentTerm || '',
        destination: parsed.destination || '',
        receivedAt: receivedAt.toISOString(),
        syncedAt: receivedAt
      };

      appendReportRow_(reportSheet, rowData);
      auditSheet.appendRow([receivedAt, 'accepted', reportId, syncJobId, messageId, 'Direct LINE report saved via Gemini']);

      // ส่งข้อความยืนยัน
      const confirmMsg = '✅ [บันทึกงานขึ้นของ PSC เรียบร้อย]\n' +
        '🥬 สินค้า: ' + (parsed.item || '-') + '\n' +
        '⚖️ จำนวน: ' + (parsed.quantityKg ? Number(parsed.quantityKg).toLocaleString() + ' กก.' : '-') + '\n' +
        '📅 วันขึ้นของ: ' + (parsed.loadingDate || '-') + '\n' +
        '🎯 ส่งมอบ: ' + (parsed.deliveryDate || '-') + '\n' +
        '📍 เส้นทาง: ' + (parsed.origin || '-') + ' → ' + (parsed.destination || '-') + '\n' +
        '🏡 ผู้จำหน่าย: ' + (parsed.seller || '-');
      notifyResult_(event, confirmMsg);

      // ซิงค์เฉพาะงานนี้เข้า 1_Farm_Ops_Transport_and_Intake ทันที
      try {
        const detail = "ขึ้น" + (parsed.item || '') + (parsed.destination ? " เข้า " + parsed.destination : "");
        const loadingDate = parsed.loadingDate || parsed.eventDate || Utilities.formatDate(receivedAt, 'Asia/Bangkok', 'dd/MM/yyyy');
        const qKg = Number(parsed.quantityKg) || 0;

        appendFarmOpsTask_({
          receivedAt: receivedAt,
          scheduleRow: qKg > 0 ? [
            "OPS-" + Utilities.formatDate(receivedAt, "Asia/Bangkok", "yyyyMMdd-HHmm"),
            loadingDate,
            parsed.seller || "เฮียหนิง",
            parsed.origin || "บ่อสลี",
            "6 ล้อ " + (parsed.seller || ""),
            detail,
            qKg,
            "รอดำเนินการ"
          ] : null,
          inboxRow: [
            receivedAt,
            "line_direct",
            "ขึ้นของ",
            parsed.item || '',
            loadingDate,
            qKg,
            parsed.destination || '',
            "received",
            rawText
          ]
        });
      } catch (fErr) {
        Logger.log("Direct dispatch sync to Farm Ops error: " + fErr);
      }
    } else if (parsed.reportType === 'cancel') {
      // 3. กรณีแจ้งยกเลิกงาน
      const cancelRow = {
        syncJobId: syncJobId,
        reportId: reportId,
        source: 'line_direct',
        messageId: messageId,
        rawText: rawText,
        reportType: 'cancel',
        seller: '',
        item: parsed.item || 'กะหล่ำปลี',
        origin: '',
        eventDate: parsed.targetDate || '',
        quantityKg: '',
        gradeMediumKg: '',
        gradeSmallKg: '',
        qualityNote: 'ขอยกเลิกงาน: ' + (parsed.reason || rawText),
        sampleKg: '',
        yieldKg: '',
        freightBaht: '',
        paymentTerm: '',
        destination: parsed.destination || '',
        receivedAt: receivedAt.toISOString(),
        syncedAt: receivedAt
      };

      appendReportRow_(reportSheet, cancelRow);
      auditSheet.appendRow([receivedAt, 'accepted', reportId, syncJobId, messageId, 'Direct LINE cancel task saved']);

      const cancelConfirmMsg = '🛑 [รับแจ้งยกเลิกงาน PSC เรียบร้อย]\n' +
        '🥬 สินค้า: ' + (parsed.item || '-') + '\n' +
        '📅 วันที่ยกเลิก: ' + (parsed.targetDate || '-') + '\n' +
        '🎯 ปลายทาง: ' + (parsed.destination || '-') + '\n' +
        '📝 รายละเอียด: ' + (parsed.reason || rawText);
      notifyResult_(event, cancelConfirmMsg);
    } else if (parsed.reportType === 'price_survey' && parsed.priceEntries && parsed.priceEntries.length > 0) {
      // 4. กรณีรายงานสำรวจราคารายวัน / ค่ารถ
      const surveyDate = parsed.surveyDate || Utilities.formatDate(receivedAt, 'Asia/Bangkok', 'dd/MM/yyyy');
      for (let p = 0; p < parsed.priceEntries.length; p++) {
        const pe = parsed.priceEntries[p];
        const priceRow = {
          syncJobId: syncJobId,
          reportId: reportId + '-P' + (p + 1),
          source: 'line_direct',
          messageId: messageId,
          rawText: rawText,
          reportType: 'price_survey',
          seller: pe.seller || '',
          item: (parsed.item || 'กะหล่ำปลี') + (pe.variety ? ' (' + pe.variety + ')' : ''),
          origin: pe.location || '',
          eventDate: surveyDate,
          quantityKg: '',
          gradeMediumKg: '',
          gradeSmallKg: '',
          qualityNote: pe.note || (pe.hasGoods === false ? 'ไม่มีของ' : ''),
          sampleKg: '',
          yieldKg: '',
          freightBaht: pe.truck6Price || pe.truck4Price || '',
          paymentTerm: '',
          destination: '',
          receivedAt: receivedAt.toISOString(),
          syncedAt: receivedAt
        };
        appendReportRow_(reportSheet, priceRow);
      }
      auditSheet.appendRow([receivedAt, 'accepted', reportId, syncJobId, messageId, 'Direct LINE price survey saved (' + parsed.priceEntries.length + ' entries)']);

      // ตอบกลับสรุป
      let priceSummary = '💰 [รับรายงานราคา/ค่ารถ PSC เรียบร้อย]\n📅 วันที่: ' + surveyDate + '\n';
      for (let p = 0; p < Math.min(parsed.priceEntries.length, 5); p++) {
        const pe = parsed.priceEntries[p];
        priceSummary += '• ' + pe.seller + ': ' + (pe.pricePerKg ? pe.pricePerKg + ' บ./กก.' : '-') + (pe.truck6Price ? ' (6ล้อ ' + Number(pe.truck6Price).toLocaleString() + ')' : '') + '\n';
      }
      notifyResult_(event, priceSummary.trim());

      // ซิงค์เข้า 2_Material_Prices_and_Freight_Matrix ทันที
      syncPriceSurveyToDrive_(parsed, surveyDate);
    }
  } catch (err) {
    Logger.log("handleLineDirectEvent write error: " + err);
    auditBestEffort_([receivedAt, 'error', reportId, syncJobId, messageId, 'Write error: ' + String(err)]);
  } finally {
    lock.releaseLock();
  }
}

/**
 * จัดการรูปภาพที่ส่งเข้ามาใน LINE (เช่น ใบสั่งซื้อ PO / ตารางคำสั่งซื้อ Excel / แผนส่งมอบผัก)
 */
function handleLineImageEvent_(event, receivedAt) {
  const messageId = String(event.message.id || '');
  const reportId = 'LINE-IMG-' + messageId;
  const syncJobId = 'direct-img-' + (receivedAt.getTime());
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');

  if (!token || !messageId) return;

  // 1. ดาวน์โหลด Binary Content ของรูปภาพจาก LINE Messaging API (ทำนอก Lock)
  let base64Data = '';
  let mimeType = 'image/jpeg';
  try {
    const imgUrl = 'https://api-data.line.me/v2/bot/message/' + messageId + '/content';
    const response = UrlFetchApp.fetch(imgUrl, {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log("Download image failed: " + response.getResponseCode());
      auditBestEffort_([receivedAt, 'error', reportId, syncJobId, messageId, 'Download image failed: HTTP ' + response.getResponseCode()]);
      return;
    }

    const imageBlob = response.getBlob();
    base64Data = Utilities.base64Encode(imageBlob.getBytes());
    
    // ดึง Content-Type จากทั้ง blob และ response header พร้อม fallback เป็น image/jpeg
    let detectedMime = (imageBlob.getContentType() || '').trim();
    if (!detectedMime || !detectedMime.startsWith('image/')) {
      const headers = response.getHeaders() || {};
      const hType = (headers['Content-Type'] || headers['content-type'] || '').split(';')[0].trim();
      if (hType && hType.startsWith('image/')) {
        detectedMime = hType;
      }
    }
    mimeType = (detectedMime && detectedMime.startsWith('image/')) ? detectedMime : 'image/jpeg';
  } catch (dErr) {
    Logger.log("Download image exception: " + dErr);
    auditBestEffort_([receivedAt, 'error', reportId, syncJobId, messageId, 'Download image exception: ' + String(dErr)]);
    return;
  }

  // 2. ส่งรูปให้ Gemini 2.5 Flash ช่วยอ่านตารางและตัวเลขใน PO (ทำนอก Lock)
  const parsed = interpretImageWithGemini(base64Data, mimeType);
  if (!parsed || parsed.reportType === 'none') {
    Logger.log("Non-order image ignored: " + messageId);
    auditBestEffort_([receivedAt, 'ignored', reportId, syncJobId, messageId, 'Non-order image, not a report']);
    return;
  }

  // 3. ล็อคเฉพาะขั้นตอนการบันทึกลงชีต (Lock Scope ให้สั้นที่สุด)
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const reportSheet = ensureSheet_(ss, REPORT_SHEET, REPORT_HEADERS);
    const auditSheet = ensureSheet_(ss, AUDIT_SHEET, AUDIT_HEADERS);

    if (findDuplicate_(reportSheet, messageId, reportId)) {
      auditSheet.appendRow([receivedAt, 'duplicate', reportId, syncJobId, messageId, 'Direct LINE image duplicate ignored']);
      return;
    }

    // บันทึกและส่งข้อมูลเข้าชีตเป้าหมาย
    syncPOToCustomerWorkbooks_(parsed, receivedAt, reportId);
    auditSheet.appendRow([receivedAt, 'accepted', reportId, syncJobId, messageId, 'Image report saved (' + parsed.reportType + ')']);

    // สรุปผลและแจ้งเตือน
    let summaryMsg = '';
    if (parsed.reportType === 'salaya_schedule' || parsed.customer === 'ศาลายา' || parsed.customer === 'โรงงานศาลายา') {
      summaryMsg = '🚛 [รับตารางคำสั่งศาลายาเข้า Farm Ops เรียบร้อย]\n' +
        '🏭 ปลายทาง: โรงงานศาลายา\n' +
        '📅 รอบส่งมอบ: ' + (parsed.deliveryDate || '-') + '\n';
      if (parsed.items && parsed.items.length > 0) {
        summaryMsg += '📋 คิวงานสั่งรถล่วงหน้า (ขึ้นก่อน 1 วัน):\n';
        for (let i = 0; i < parsed.items.length; i++) {
          const itm = parsed.items[i];
          summaryMsg += '• ขึ้น ' + (itm.loadingDate || '-') + ' ➔ ส่งมอบ ' + (itm.deliveryDate || '-') + ' : ' + (itm.item || 'กะหล่ำปลี') + ' ' + Number(itm.quantityKg || 0).toLocaleString() + ' กก.\n';
        }
      }
    } else {
      summaryMsg = '📄 [รับใบสั่งซื้อ / PO เรียบร้อย]\n' +
        '🏢 ลูกค้า: ' + (parsed.customer || '-') + '\n' +
        '📑 เลขที่ PO: ' + (parsed.poNumber || '-') + '\n' +
        '📅 วันที่เอกสาร: ' + (parsed.orderDate || '-') + '\n' +
        '🎯 กำหนดส่งมอบ: ' + (parsed.deliveryDate || '-') + '\n';
      if (parsed.items && parsed.items.length > 0) {
        summaryMsg += '📦 รายการสินค้า:\n';
        for (let i = 0; i < parsed.items.length; i++) {
          const itm = parsed.items[i];
          summaryMsg += '• ' + itm.item + ': ' + Number(itm.quantityKg || 0).toLocaleString() + ' กก.' + (itm.unitPrice ? ' (@' + itm.unitPrice + ' บ.)' : '') + '\n';
        }
      }
      if (parsed.totalAmountBaht) {
        summaryMsg += '💰 ยอดรวม: ' + Number(parsed.totalAmountBaht).toLocaleString() + ' บาท\n';
      }
    }

    notifyResult_(event, summaryMsg.trim());
  } catch (imgErr) {
    Logger.log("handleLineImageEvent write error: " + imgErr);
    auditBestEffort_([receivedAt, 'error', reportId, syncJobId, messageId, 'Image write error: ' + String(imgErr)]);
  } finally {
    lock.releaseLock();
  }
}


// ===================== 4. GEMINI AI =====================

/**
 * เรียกใช้ Gemini 2.5 Flash ฟรี เพื่อแปลงข้อความภาษาพูดเป็นโครงสร้าง JSON
 */
function interpretWithGemini(rawText) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { reportType: 'general', rawText: rawText, status: 'no_gemini_key' };
  }

  const todayStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");

  const prompt = 'คุณคือระบบ AI สกัดข้อมูลสำหรับธุรกิจ PSC (ขนส่งและสต็อกสินค้าเกษตร)\n' +
    'วันที่ปัจจุบัน: ' + todayStr + '\n\n' +
    'จงวิเคราะห์ข้อความ แล้วสกัดข้อมูลเป็น JSON object เท่านั้น:\n' +
    'กรณีที่ 1: รายงานสต็อกคงเหลือ (stock report):\n' +
    '{\n' +
    '  "reportType": "stock",\n' +
    '  "asOfDate": "YYYY-MM-DD",\n' +
    '  "stockItems": [\n' +
    '    {"item": "ชื่อสินค้า", "quantityKg": number}\n' +
    '  ]\n' +
    '}\n\n' +
    'กรณีที่ 2: งานขึ้นของ / ขนส่ง (dispatch/transport):\n' +
    '{\n' +
    '  "reportType": "dispatch",\n' +
    '  "item": "ชื่อสินค้า",\n' +
    '  "seller": "ผู้จำหน่าย/สวน",\n' +
    '  "origin": "ต้นทาง/จุดขึ้นของ",\n' +
    '  "destination": "ปลายทาง",\n' +
    '  "loadingDate": "YYYY-MM-DD",\n' +
    '  "deliveryDate": "YYYY-MM-DD",\n' +
    '  "quantityKg": number,\n' +
    '  "qualityNote": string\n' +
    '}\n\n' +
    'กรณีที่ 3: ยกเลิกงาน / แจ้งยกเลิกขึ้นของ (cancel task):\n' +
    '{\n' +
    '  "reportType": "cancel",\n' +
    '  "item": "ชื่อสินค้าที่ยกเลิก",\n' +
    '  "targetDate": "YYYY-MM-DD",\n' +
    '  "destination": "ปลายทาง (เช่น โรงงาน/ศาลายา)",\n' +
    '  "reason": "เหตุผลหรือข้อความยกเลิก"\n' +
    '}\n\n' +
    'กรณีที่ 4: รายงานสำรวจราคาสินค้า/ค่ารถประจำวัน (price/freight survey report):\n' +
    '{\n' +
    '  "reportType": "price_survey",\n' +
    '  "surveyDate": "YYYY-MM-DD",\n' +
    '  "item": "ชื่อสินค้า (เช่น กะหล่ำ)",\n' +
    '  "priceEntries": [\n' +
    '    {\n' +
    '      "seller": "ชื่อผู้จำหน่าย/สวน",\n' +
    '      "variety": "สายพันธุ์",\n' +
    '      "pricePerKg": number,\n' +
    '      "truck4Price": number,\n' +
    '      "truck6Price": number,\n' +
    '      "location": "จุดขึ้นของ/เส้นทาง",\n' +
    '      "hasGoods": boolean,\n' +
    '      "note": "หมายเหตุ เช่น มีของขนาดเล็ก/ยังไม่มีของ"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'กรณีที่ 5: ข้อความพูดคุยทั่วไป ทักทาย หรือไม่ใช่รายงานสต็อก/ขึ้นของ/ราคา (casual chit-chat/irrelevant):\n' +
    '{\n' +
    '  "reportType": "none"\n' +
    '}\n\n' +
    'กฎสำคัญ:\n' +
    '- "กำหนดส่งมอบ / วันที่ต้องถึงโรงงาน" คือ deliveryDate\n' +
    '- "วันขึ้นของ / วันตัดขึ้นรถ" คือ loadingDate (หากในข้อความระบุวันขึ้นของชัดเจน ให้ใช้วันนั้น แต่ถ้าไม่ได้ระบุ ให้คำนวณขึ้นก่อนวันส่งมอบถึงโรงงาน 1 วัน: loadingDate = deliveryDate - 1 วัน)\n' +
    '- เช่น ถ้าข้อความบอก "ส่งโรงงานวันที่ 21/9" -> deliveryDate คือ 2026-09-21 และ loadingDate คือ 2026-09-20 แต่ถ้าบอก "ขึ้นของวันที่ 20 ส่ง 21" -> loadingDate=2026-09-20, deliveryDate=2026-09-21\n' +
    '- ถ้ามีคำว่า "ราคากะหล่ำ" หรือ "ราคา...วันนี้" หรือรายงานราคาหน้าสวนหลายเจ้า ให้ตอบเป็นกรณีที่ 4 (price_survey)\n' +
    '- ถ้ามีคำว่า "ยกเลิก" เกี่ยวกับสินค้าหรืองานขึ้นของ ให้ตอบเป็นกรณีที่ 3 (cancel)\n' +
    '- ถ้าเป็นข้อความพูดคุย สนทนาทั่วไป หรือไม่มีข้อมูลสินค้า/น้ำหนัก/งานขึ้นของอย่างชัดเจน ให้ตอบ {"reportType": "none"} ทันที ห้ามเดาเป็นงานขึ้นของ\n' +
    '- แปลง "ตัน" เป็น กก. (เช่น 8 ตัน -> 8000)\n' +
    '- คำนวณวันที่จาก "17/09/69", "18/9" โดยอิงปี ค.ศ. ให้ถูกต้อง (เช่น 69 คือ 2026)\n' +
    '- คืนค่าเฉพาะ raw JSON object เท่านั้น ห้ามใส่ markdown block\n\n' +
    'ข้อความ:\n"""' + rawText + '"""';

  return callGeminiApi_(prompt, null, apiKey) || { reportType: 'none', rawText: rawText, status: 'fallback' };
}

/**
 * เรียก Gemini Vision สกัดข้อมูลคำสั่งซื้อจากภาพถ่าย / แคปหน้าจอ
 */
function interpretImageWithGemini(base64Data, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { reportType: 'none', error: 'no_api_key' };

  const prompt = 'คุณคือระบบ AI สกัดข้อมูลสำหรับธุรกิจ PSC (ขนส่งและสต็อกสินค้าเกษตร)\n' +
    'จงวิเคราะห์ภาพว่าจัดอยู่ในประเภทใดใน 2 ประเภทนี้:\n\n' +
    'ประเภทที่ 1: ตารางคิวงาน/แผนส่งมอบโรงงานของทีมงานภายใน (เช่น ตารางส่งกะหล่ำหนักเข้าศาลายา, แผนสั่งรถ):\n' +
    '{\n' +
    '  "reportType": "salaya_schedule",\n' +
    '  "customer": "ศาลายา",\n' +
    '  "deliveryDate": "DD/MM/YYYY",\n' +
    '  "items": [\n' +
    '    {\n' +
    '      "item": "ชื่อสินค้า เช่น กะหล่ำปลี",\n' +
    '      "quantityKg": number,\n' +
    '      "deliveryDate": "DD/MM/YYYY (วันที่ต้องถึงโรงงาน)",\n' +
    '      "loadingDate": "DD/MM/YYYY (วันขึ้นของ = ก่อนวันถึงโรงงาน 1 วันเสมอ)"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'ประเภทที่ 2: เอกสารใบสั่งซื้ออย่างเป็นทางการของลูกค้าภายนอก (PO จาก Siam Yamamori, TNS, AFT):\n' +
    '{\n' +
    '  "reportType": "customer_po",\n' +
    '  "customer": "ชื่อลูกค้า",\n' +
    '  "poNumber": "เลขที่ PO",\n' +
    '  "orderDate": "DD/MM/YYYY",\n' +
    '  "deliveryDate": "DD/MM/YYYY",\n' +
    '  "items": [\n' +
    '    {"item": "ชื่อสินค้า", "quantityKg": number, "unitPrice": number}\n' +
    '  ],\n' +
    '  "totalAmountBaht": number\n' +
    '}\n\n' +
    'กฎเหล็ก:\n' +
    '- หากเป็นภาพตารางข้อความในไลน์ หรือตารางส่งผักเข้าโรงงาน เช่น กะหล่ำปลีหนักเข้า ศาลายา ให้กำหนด reportType เป็น "salaya_schedule" ทันที (จะถูกส่งเข้า 1_Farm_Ops_Transport_and_Intake เท่านั้น ห้ามส่งเข้า 4_Customer_POs)\n' +
    '- วันที่ในตารางคือวันที่ต้องถึงโรงงาน (deliveryDate) ส่วนวันขึ้นของ (loadingDate) ต้องคำนวณถอยหลัง 1 วันเสมอ เช่น ถึง 21/09/26 -> ขึ้นของ 20/09/26\n' +
    '- หากไม่ใช่ภาพตารางคำสั่งงานหรือใบ PO ให้ตอบ {"reportType": "none"}\n' +
    '- ส่งคืนเฉพาะ Raw JSON object เท่านั้น ห้ามใส่ markdown block';

  return callGeminiApi_(prompt, { mimeType: (mimeType && mimeType.trim()) || 'image/jpeg', base64Data: base64Data }, apiKey) || { reportType: 'none' };
}

/**
 * เรียก Gemini API (ข้อความอย่างเดียว หรือข้อความ+รูปภาพ) แล้ว parse JSON ที่ได้กลับมา
 * ใช้แทนโค้ด fetch/parse/error-handling ที่เดิมซ้ำกันใน interpretWithGemini และ interpretImageWithGemini
 * imagePart: { mimeType, base64Data } หรือ null ถ้าไม่มีรูป
 * คืนค่า parsed JSON เมื่อสำเร็จ, หรือ null เมื่อล้มเหลว (ผู้เรียกกำหนด fallback เอง)
 */
function callGeminiApi_(promptText, imagePart, apiKey) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;
  const parts = [{ text: promptText }];
  if (imagePart && imagePart.base64Data) {
    const safeMime = (imagePart.mimeType && imagePart.mimeType.trim().startsWith('image/')) ? imagePart.mimeType.trim() : 'image/jpeg';
    parts.push({ inlineData: { mimeType: safeMime, data: imagePart.base64Data } });
  }

  const payload = {
    contents: [{ parts: parts }],
    generationConfig: { responseMimeType: "application/json" }
  };

  const fetchOptions = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // ดำเนินการเรียก Gemini พร้อมระบบ Retry 1 ครั้งเมื่อเกิด Error หรือ Timeout ชั่วคราว
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = UrlFetchApp.fetch(url, fetchOptions);
      const statusCode = res.getResponseCode();

      if (statusCode === 200) {
        const resJson = JSON.parse(res.getContentText());
        const candidateText = resJson.candidates && resJson.candidates[0] && resJson.candidates[0].content && resJson.candidates[0].content.parts && resJson.candidates[0].content.parts[0] && resJson.candidates[0].content.parts[0].text;
        if (candidateText) {
          const parsed = JSON.parse(candidateText);
          return sanitizeGeminiResult_(parsed);
        }
      }

      const errDetail = "Gemini API HTTP " + statusCode + " (Attempt " + attempt + "/" + maxAttempts + "): " + res.getContentText().slice(0, 200);
      Logger.log(errDetail);
      if (attempt === maxAttempts) {
        auditBestEffort_([new Date(), 'error', '', '', '', errDetail]);
      }
    } catch (err) {
      const exDetail = "Gemini exception (Attempt " + attempt + "/" + maxAttempts + "): " + String(err);
      Logger.log(exDetail);
      if (attempt === maxAttempts) {
        auditBestEffort_([new Date(), 'error', '', '', '', exDetail]);
      }
    }

    if (attempt < maxAttempts) {
      Utilities.sleep(1200); // Backoff ก่อนลองใหม่ 1.2 วินาที
    }
  }

  return null;
}

/**
 * ตรวจสอบความถูกต้องของตัวเลขและขอบเขตค่า (Sanity Check) เพื่อป้องกัน Hallucination
 */
function sanitizeGeminiResult_(data) {
  if (!data || typeof data !== 'object') return { reportType: 'none' };

  // Helper สำหรับ validate ตัวเลขให้อยู่ในช่วงที่สมเหตุสมผล
  function cleanNumber(val, min, max, defaultVal) {
    if (val === null || val === undefined || val === '') return defaultVal;
    const n = Number(val);
    if (isNaN(n) || !isFinite(n) || n < min || n > max) return defaultVal;
    return n;
  }

  // 1. ตรวจสอบสต็อก
  if (data.reportType === 'stock' && Array.isArray(data.stockItems)) {
    data.stockItems = data.stockItems.map(function(item) {
      return {
        item: String(item.item || '').trim(),
        quantityKg: cleanNumber(item.quantityKg, 0, 200000, 0)
      };
    }).filter(function(item) { return item.item && item.quantityKg > 0; });
  }

  // 2. ตรวจสอบงานขึ้นของ
  if (data.reportType === 'dispatch') {
    data.quantityKg = cleanNumber(data.quantityKg, 0, 100000, 0);
    data.gradeMediumKg = cleanNumber(data.gradeMediumKg, 0, 100000, 0);
    data.gradeSmallKg = cleanNumber(data.gradeSmallKg, 0, 100000, 0);
    data.freightBaht = cleanNumber(data.freightBaht, 0, 100000, 0);
    data.sampleKg = cleanNumber(data.sampleKg, 0, 5000, 0);
    data.yieldKg = cleanNumber(data.yieldKg, 0, 5000, 0);
  }

  // 3. ตรวจสอบรายงานราคา
  if (data.reportType === 'price_survey' && Array.isArray(data.priceEntries)) {
    data.priceEntries = data.priceEntries.map(function(entry) {
      return {
        seller: String(entry.seller || '').trim(),
        variety: String(entry.variety || '').trim(),
        pricePerKg: cleanNumber(entry.pricePerKg, 0, 200, 0),
        truck4Price: cleanNumber(entry.truck4Price, 0, 50000, 0),
        truck6Price: cleanNumber(entry.truck6Price, 0, 100000, 0),
        location: String(entry.location || '').trim(),
        hasGoods: entry.hasGoods !== false,
        note: String(entry.note || '').trim()
      };
    });
  }

  // 4. ตรวจสอบตารางส่งมอบและ PO จากรูปภาพ
  if (Array.isArray(data.items)) {
    data.items = data.items.map(function(item) {
      return {
        item: String(item.item || '').trim(),
        quantityKg: cleanNumber(item.quantityKg, 0, 200000, 0),
        unitPrice: cleanNumber(item.unitPrice, 0, 1000, 0),
        deliveryDate: item.deliveryDate || '',
        loadingDate: item.loadingDate || ''
      };
    }).filter(function(item) { return item.quantityKg > 0; });
  }

  if (data.totalAmountBaht !== undefined) {
    data.totalAmountBaht = cleanNumber(data.totalAmountBaht, 0, 5000000, 0);
  }

  return data;
}


// ===================== 5. SYNC TO DESTINATION SHEETS =====================

/**
 * ซิงค์เฉพาะรายงานสต็อกเข้า 3_Physical_Stock_and_Forecast เมื่อมีรายงานสต็อกเข้ามาจริงเท่านั้น
 */
function syncPhysicalStockToDrive_(stockItems, asOfDate) {
  try {
    const stockSs = SpreadsheetApp.openById(PHYSICAL_STOCK_ID);
    const currentSheet = getCurrentStockSheet_(stockSs);
    if (!currentSheet) return;

    // อ่านยอดสต็อกปัจจุบันจากชีต (แถว 4-8) เป็นค่าตั้งต้น (ไม่ hardcode)
    const existing = currentSheet.getRange("A4:H8").getValues();
    const stockMap = {};
    for (let r = 0; r < existing.length; r++) {
      stockMap[String(existing[r][1]).trim()] = {
        row: r + 4,
        qty: Number(existing[r][2]) || 0
      };
    }

    // อัปเดตยอดตามรายการที่ส่งมาจริงใน LINE
    const dateStr = asOfDate || Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
    for (let i = 0; i < stockItems.length; i++) {
      const itm = String(stockItems[i].item || '').trim();
      const q = Number(stockItems[i].quantityKg) || 0;

      for (const key in stockMap) {
        if (key.includes(itm) || itm.includes(key)) {
          stockMap[key].qty = q;
          currentSheet.getRange(stockMap[key].row, 3).setValue(q);
          currentSheet.getRange(stockMap[key].row, 6).setValue(q);
        }
      }
    }

    currentSheet.getRange("A2").setValue("ยอดตรวจนับจริงล่าสุด ณ วันที่ " + dateStr + " | อัปเดตจากรายงาน LINE (Gemini Standalone)");

    // บันทึกลง Audit Log
    const auditSheet = stockSs.getSheetByName("Audit Log & Comparison");
    if (auditSheet) {
      const cabbage = findQtyByKeyword_(stockMap, "กะหล่ำ");
      const onionAFT = findQtyByKeyword_(stockMap, "AFT");
      const onionCN = findQtyByKeyword_(stockMap, "จีน");
      const carrot = findQtyByKeyword_(stockMap, "แครอท");
      const purple = findQtyByKeyword_(stockMap, "มันม่วง");

      auditSheet.appendRow([
        dateStr,
        Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm"),
        cabbage, onionAFT, onionCN, carrot, purple,
        "ตรวจนับจริงประจำวัน / LINE รายงานสต็อก (Gemini Standalone)"
      ]);
    }

    prepareCleanTabsForLookerStudio();
    Logger.log("✅ ซิงค์สต็อกเข้า 3_Physical_Stock_and_Forecast สำเร็จ");
  } catch (e) {
    Logger.log("Sync Physical Stock error: " + e);
  }
}

/**
 * ซิงค์ข้อมูลสำรวจราคา/ค่ารถเข้า 2_Material_Prices_and_Freight_Matrix โดยตรงอย่างถูกต้อง
 */
function syncPriceSurveyToDrive_(parsed, surveyDate) {
  try {
    const priceSs = SpreadsheetApp.openById(MATERIAL_PRICES_ID);
    const cleanPriceSheet = priceSs.getSheetByName("Clean_Material_Prices");
    const dailyLogSheet = priceSs.getSheetByName("Daily Price Log");

    const newCleanRows = [];
    for (let p = 0; p < parsed.priceEntries.length; p++) {
      const pe = parsed.priceEntries[p];
      const pPerKg = Number(pe.pricePerKg) || '';
      const c4 = Number(pe.truck4Price) || '';
      const c6 = Number(pe.truck6Price) || '';
      const tot6 = (pPerKg && c6) ? Number((pPerKg + (c6 / 9000)).toFixed(2)) : '';
      const tot4 = (pPerKg && c4) ? Number((pPerKg + (c4 / 3500)).toFixed(2)) : '';

      newCleanRows.push([
        surveyDate,
        pe.seller || '',
        pe.location || '',
        pe.variety || 'พันธุ์ช้าง',
        pPerKg,
        c4,
        c6,
        pe.seller || '',
        tot6,
        tot4,
        pe.note || (pe.hasGoods === false ? 'ไม่มีของ' : 'รับข้อมูล ' + surveyDate)
      ]);
    }

    if (cleanPriceSheet && newCleanRows.length > 0) {
      cleanPriceSheet.getRange(cleanPriceSheet.getLastRow() + 1, 1, newCleanRows.length, 11).setValues(newCleanRows);
      Logger.log("✅ เพิ่มข้อมูลราคาลง Clean_Material_Prices เรียบร้อย " + newCleanRows.length + " รายการ");
    }

    if (dailyLogSheet && newCleanRows.length > 0) {
      dailyLogSheet.getRange(dailyLogSheet.getLastRow() + 1, 1, newCleanRows.length, 11).setValues(newCleanRows);
      Logger.log("✅ เพิ่มข้อมูลราคาลง Daily Price Log เรียบร้อย");
    }
  } catch (err) {
    Logger.log("syncPriceSurveyToDrive_ error: " + err);
  }
}

/**
 * บันทึกคำสั่งซื้อ / ตารางคิวงานจากภาพเข้าไฟล์ชีตเป้าหมาย
 */
function syncPOToCustomerWorkbooks_(parsed, receivedAt, reportId) {
  const isSalayaInternal = (parsed.reportType === 'salaya_schedule' || parsed.customer === 'ศาลายา' || parsed.customer === 'โรงงานศาลายา');

  // 1. ถ้าเป็นตารางงานภายในทีมงานศาลายา -> บันทึกเข้า 1_Farm_Ops_Transport_and_Intake เท่านั้น (ไม่เข้า 4_Customer_POs)
  if (isSalayaInternal) {
    if (parsed.items && parsed.items.length > 0) {
      parsed.items.forEach(function(it) {
        const qKg = Number(it.quantityKg) || 0;
        if (qKg <= 0) return;
        const dDate = it.deliveryDate || parsed.deliveryDate || "";
        const lDate = it.loadingDate || "";
        const detail = "ขึ้น" + (it.item || "กะหล่ำปลี") + " เข้า ศาลายา (" + qKg.toLocaleString() + " กก.)";

        appendFarmOpsTask_({
          receivedAt: receivedAt,
          scheduleRow: [
            "OPS-" + Utilities.formatDate(receivedAt, "Asia/Bangkok", "yyyyMMdd-HHmm"),
            lDate || dDate,
            "ยังไม่ระบุ",
            "ศาลายา",
            "ยังไม่ระบุ",
            detail,
            qKg,
            "รอดำเนินการ"
          ],
          inboxRow: [
            receivedAt,
            "line_image",
            "ตารางส่งมอบศาลายา",
            it.item || "กะหล่ำปลี",
            lDate || dDate,
            qKg,
            "ศาลายา (ถึง " + dDate + ")",
            "received",
            "ตารางแผนส่งมอบทีมงานศาลายา"
          ]
        });
      });
      Logger.log("✅ บันทึกตารางศาลายาเข้า 1_Farm_Ops_Transport_and_Intake เรียบร้อย");
    }
    return;
  }

  // 2. ถ้าเป็นใบสั่งซื้อทางการของลูกค้า (PO ภายนอก เช่น Siam Yamamori, TNS, AFT) -> บันทึกเข้า 4_Customer_POs_and_Delivery_Plans
  try {
    const poSs = SpreadsheetApp.openById(CUSTOMER_POS_ID);
    const poRegisterSheet = poSs.getSheetByName("Customer PO Register");

    if (poRegisterSheet) {
      let totalQty = 0;
      const itemNames = [];
      if (parsed.items && parsed.items.length > 0) {
        parsed.items.forEach(function(it) {
          totalQty += Number(it.quantityKg) || 0;
          itemNames.push((it.item || '') + ' (' + (Number(it.quantityKg) || 0).toLocaleString() + ' kg)');
        });
      }

      poRegisterSheet.appendRow([
        parsed.customer || "ลูกค้าทั่วไป",
        parsed.poNumber || ("LINE-" + Utilities.formatDate(receivedAt, "Asia/Bangkok", "yyyyMMdd-HHmm")),
        parsed.orderDate || Utilities.formatDate(receivedAt, "Asia/Bangkok", "dd/MM/yyyy"),
        parsed.deliveryDate || "ระบุในเอกสาร",
        itemNames.join(", "),
        totalQty,
        (parsed.items && parsed.items[0] && parsed.items[0].unitPrice) || "-",
        parsed.totalAmountBaht || "-",
        "รอส่งมอบ (Active PO via LINE Image)",
        "LINE Capture (" + reportId + ")"
      ]);
      Logger.log("✅ บันทึก PO ลูกค้าภายนอกลง Customer PO Register เรียบร้อย");
    }
  } catch (err) {
    Logger.log("syncPOToCustomerWorkbooks_ error: " + err);
  }
}

/**
 * เขียนงานขึ้นของเข้า 1_Farm_Ops_Transport_and_Intake (แท็บ Schedule + แท็บ Inbox)
 * ใช้แทนโค้ดที่เดิมซ้ำกันทั้งใน handleLineDirectEvent_ และ syncPOToCustomerWorkbooks_
 * opts: { receivedAt, scheduleRow (array หรือ null เพื่อข้าม), intakeRow (19-column array หรือ null เพื่อข้าม) }
 */
function appendFarmOpsTask_(opts) {
  try {
    const farmOpsSs = SpreadsheetApp.openById(FARM_OPS_ID);
    const scheduleSheet = farmOpsSs.getSheetByName("Next Schedule & Other Tasks");
    const inboxSheet = farmOpsSs.getSheetByName("Dispatch & Intake Log") || farmOpsSs.getSheetByName("Dispatch & Intake") || farmOpsSs.getSheetByName("LINE Intake Inbox");

    if (opts.scheduleRow && scheduleSheet) {
      scheduleSheet.appendRow(opts.scheduleRow);
    }
    if (opts.intakeRow && inboxSheet) {
      // Dispatch & Intake Log has 19 operational columns (A:S). Keep intake
      // rows aligned with its header; never write the 9-column schedule shape.
      inboxSheet.appendRow(opts.intakeRow);
    } else if (opts.inboxRow && inboxSheet) {
      // Backward compatibility for legacy inbox destinations.
      inboxSheet.appendRow(opts.inboxRow);
    }
  } catch (fErr) {
    Logger.log("Farm ops sync error: " + fErr);
  }
}


// ===================== 6. LINE MESSAGING =====================

function replyLine_(replyToken, message) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token || !replyToken) return;

  try {
    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json; charset=utf-8"
      },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: "text", text: message }]
      }),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Reply Line error: " + err);
  }
}

/**
 * ส่งข้อความตรงหา User ID (Push Message)
 */
function pushLineMessage_(targetUserId, message) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token || !targetUserId) return;

  try {
    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json; charset=utf-8"
      },
      payload: JSON.stringify({
        to: targetUserId,
        messages: [{ type: "text", text: message }]
      }),
      muteHttpExceptions: true
    });
    Logger.log("✅ ส่งแจ้งเตือนหาแอดมิน (" + targetUserId + ") เรียบร้อย");
  } catch (err) {
    Logger.log("Push Line error: " + err);
  }
}

/**
 * ตัดสินใจส่งข้อความ:
 * - ถ้ามาจากกลุ่ม: ไม่ตอบกลับในกลุ่ม แต่ส่ง Push Notification หาแอดมินคนเดียว
 * - ถ้ามาจากแชตส่วนตัว: ตอบกลับหาผู้ส่งโดยตรง
 */
function notifyResult_(event, message) {
  const source = (event && event.source) || {};
  const isGroup = (source.type === 'group' || source.type === 'room');
  const adminId = PropertiesService.getScriptProperties().getProperty('LINE_ADMIN_USER_ID');
  if (!adminId) {
    Logger.log("⚠️ ไม่ได้ตั้งค่า Script Property 'LINE_ADMIN_USER_ID' จะไม่สามารถส่งแจ้งเตือนแอดมินได้");
  }

  if (isGroup) {
    // 1. ตอบในกลุ่มสั้นๆ แค่รับทราบ ไม่รบกวนกลุ่ม
    if (event && event.replyToken) {
      replyLine_(event.replyToken, '✅ รับข้อมูลเรียบร้อยแล้วครับ');
    }
    // 2. ส่งรายละเอียดเต็มเข้าไลน์ส่วนตัวของแอดมิน (เฉพาะเมื่อตั้งค่า LINE_ADMIN_USER_ID ไว้แล้ว)
    if (adminId) {
      const adminMsg = '🔔 [แจ้งเตือนแอดมิน: รับรายงานจากกลุ่ม LINE]\n' + message;
      pushLineMessage_(adminId, adminMsg);
    }
  } else {
    // แชตส่วนตัว ตอบกลับผู้ใช้ตามปกติ
    if (event && event.replyToken) {
      replyLine_(event.replyToken, message);
    }
  }
}


// ===================== 7. UTILITIES =====================

function parseBody_(e) {
  const contents = e && e.postData && e.postData.contents;
  if (!contents) throw new Error('Request body is empty');
  const body = JSON.parse(contents);
  if (!body || typeof body !== 'object') throw new Error('Request body must be a JSON object');
  return body;
}


function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findDuplicate_(sheet, messageId, reportId) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return false;
  const headers = values[0];
  const messageIndex = headers.indexOf('messageId');
  const reportIndex = headers.indexOf('reportId');
  return values.slice(1).some(function (row) {
    return (messageId && messageIndex >= 0 && String(row[messageIndex]) === messageId) ||
      (reportIndex >= 0 && String(row[reportIndex]) === reportId);
  });
}

function cleanCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.slice(0, MAX_RAW_TEXT_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value).slice(0, MAX_RAW_TEXT_LENGTH);
}

function auditBestEffort_(row) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheet_(ss, AUDIT_SHEET, AUDIT_HEADERS).appendRow(row);
  } catch (_) {}
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * เขียนแถวลง REPORT_SHEET ตามลำดับ REPORT_HEADERS เสมอ (ใช้แทนการ map ซ้ำ 4 ที่)
 */
function appendReportRow_(sheet, rowObj) {
  sheet.appendRow(REPORT_HEADERS.map(function (key) {
    return cleanCell_(rowObj[key]);
  }));
}

function findQtyByKeyword_(map, kw) {
  for (const k in map) {
    if (k.includes(kw)) return map[k].qty;
  }
  return 0;
}

/**
 * ค้นหาแท็บสต็อกคงเหลือปัจจุบันอย่างยืดหยุ่น โดยไม่ผูกกับชื่อวันที่แบบตายตัว
 */
function getCurrentStockSheet_(ss) {
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    if (name.toLowerCase().startsWith("current stock")) {
      return sheets[i];
    }
  }
  Logger.log("⚠️ ไม่พบแท็บที่ขึ้นต้นด้วย 'Current Stock' ใช้ชีตแรกสุดแทน (โปรดตรวจสอบชื่อแท็บ)");
  return sheets[0];
}


// ===================== 8. SETUP / ONE-OFF TOOLS =====================

/**
 * ฟังก์ชันสำหรับกดเรียกใช้ครั้งแรกเพื่อเปิดหน้าต่างขอสิทธิ์ (Authorize Permission)
 */
function authorizeUrlFetch() {
  UrlFetchApp.fetch("https://www.google.com");
  Logger.log("✅ ได้รับสิทธิ์ UrlFetchApp เรียบร้อยแล้ว");
}

/**
 * ฟังก์ชันสร้างแท็บคลีนสำหรับ Looker Studio โดยเฉพาะ
 * ให้หัวคอลัมน์อยู่แถวที่ 1 ทันที ไม่มีเซลล์ผสาน ทำให้ Looker Studio อ่านฟิลด์ตัวเลขและมิติข้อมูลได้ 100%
 */
function prepareCleanTabsForLookerStudio() {
  // 1. สร้างแท็บ Clean_Stock ใน 3_Physical_Stock_and_Forecast
  try {
    const stockSs = SpreadsheetApp.openById(PHYSICAL_STOCK_ID);
    const cleanStockSheet = ensureSheet_(stockSs, "Clean_Stock", [
      "รหัสสินค้า", "ชื่อรายการสินค้า", "ยอดตรวจนับจริง_กก", "ยอดพร้อมใช้_กก", "เกณฑ์สำรองขั้นต่ำ_กก", "สถานะคลัง"
    ]);
    if (cleanStockSheet.getLastRow() > 1) {
      cleanStockSheet.getRange(2, 1, cleanStockSheet.getLastRow() - 1, 6).clearContent();
    }
    const currentSheet = getCurrentStockSheet_(stockSs);
    if (currentSheet) {
      const rawData = currentSheet.getRange("A4:H8").getValues();
      const cleanRows = rawData.map(function(r) {
        return [r[0], r[1], Number(r[2]) || 0, Number(r[5]) || 0, Number(r[6]) || 0, r[7]];
      });
      cleanStockSheet.getRange(2, 1, cleanRows.length, 6).setValues(cleanRows);
      Logger.log("✅ สร้าง Clean_Stock สำหรับ Looker Studio สำเร็จ");
    }
  } catch (e) {
    Logger.log("Clean_Stock error: " + e);
  }

  // 2. สร้างแท็บ Clean_Schedules ใน 1_Farm_Ops_Transport_and_Intake
  try {
    const farmOpsSs = SpreadsheetApp.openById(FARM_OPS_ID);
    const cleanSchedSheet = ensureSheet_(farmOpsSs, "Clean_Schedules", [
      "รหัสงาน", "กำหนดวันดำเนินการ", "ผู้จำหน่าย_สวน", "จุดขึ้นของ_แหล่งสินค้า", "รถขนส่ง", "รายละเอียดงาน", "น้ำหนัก_กก", "สถานะงาน"
    ]);
    const srcSheet = farmOpsSs.getSheetByName("Next Schedule & Other Tasks");
    if (srcSheet && srcSheet.getLastRow() >= 4) {
      if (cleanSchedSheet.getLastRow() > 1) {
        cleanSchedSheet.getRange(2, 1, cleanSchedSheet.getLastRow() - 1, 8).clearContent();
      }
      const rawSched = srcSheet.getRange(4, 1, srcSheet.getLastRow() - 3, 8).getValues();
      const validRows = rawSched.filter(function(r) { 
        return (r[0] || r[1]) && Number(r[6]) > 0 && r[5] && r[5] !== "ขึ้นเข้า "; 
      });
      if (validRows.length > 0) {
        cleanSchedSheet.getRange(2, 1, validRows.length, 8).setValues(validRows);
      }
      Logger.log("✅ สร้าง Clean_Schedules สำหรับ Looker Studio สำเร็จ (" + validRows.length + " รายการ)");
    }
  } catch (e) {
    Logger.log("Clean_Schedules error: " + e);
  }

  // 3. สร้างแท็บ Clean_Material_Prices และ Clean_Freight ใน 2_Material_Prices_and_Freight_Matrix
  try {
    const priceSs = SpreadsheetApp.openById(MATERIAL_PRICES_ID);

    // 3.1 แท็บราคาวัตถุดิบรายวัน
    const cleanPriceSheet = ensureSheet_(priceSs, "Clean_Material_Prices", [
      "วันที่สำรวจ", "ผู้จำหน่าย", "จุดขึ้นของ_แหล่งสินค้า", "สายพันธุ์", "ราคาหน้าสวน_บ_กก", "ค่ารถ_4ล้อ_บาท", "ค่ารถ_6ล้อ_บาท", "ผู้ให้บริการขนส่ง", "ต้นทุนรวมส่ง_6ล้อ_บ_กก", "ต้นทุนรวมส่ง_4ล้อ_บ_กก", "หมายเหตุ"
    ]);
    const srcPrice = priceSs.getSheetByName("Daily Price Log");
    if (srcPrice && srcPrice.getLastRow() >= 4) {
      if (cleanPriceSheet.getLastRow() > 1) {
        cleanPriceSheet.getRange(2, 1, cleanPriceSheet.getLastRow() - 1, 11).clearContent();
      }
      const rawPrices = srcPrice.getRange(4, 1, srcPrice.getLastRow() - 3, 11).getValues();
      const validPrices = rawPrices.filter(function(r) { return r[0] && r[1]; });
      if (validPrices.length > 0) {
        cleanPriceSheet.getRange(2, 1, validPrices.length, 11).setValues(validPrices);
      }
      Logger.log("✅ สร้าง Clean_Material_Prices สำหรับ Looker Studio สำเร็จ");
    }

    // 3.2 แท็บอัตราค่าขนส่ง (Freight Matrix)
    const cleanFreightSheet = ensureSheet_(priceSs, "Clean_Freight_Matrix", [
      "ผู้จัดส่ง_ผู้ให้บริการ", "สถานที่_จุดขึ้นของ", "เรทรถ_4ล้อ_บาท", "เรทรถ_6ล้อ_บาท", "เงื่อนไขขนส่ง_หมายเหตุ"
    ]);
    const srcFreight = priceSs.getSheetByName("Freight Matrix & Transporters");
    if (srcFreight && srcFreight.getLastRow() >= 4) {
      if (cleanFreightSheet.getLastRow() > 1) {
        cleanFreightSheet.getRange(2, 1, cleanFreightSheet.getLastRow() - 1, 5).clearContent();
      }
      const rawFreight = srcFreight.getRange(4, 1, srcFreight.getLastRow() - 3, 5).getValues();
      const validFreight = rawFreight.filter(function(r) { return r[0] && r[1]; });
      if (validFreight.length > 0) {
        cleanFreightSheet.getRange(2, 1, validFreight.length, 5).setValues(validFreight);
      }
      Logger.log("✅ สร้าง Clean_Freight_Matrix สำหรับ Looker Studio สำเร็จ");
    }
  } catch (e) {
    Logger.log("Clean_Material_Prices error: " + e);
  }
}

/**
 * ฟังก์ชัน Unit Test / Dry-run สำหรับทดสอบ prompt และการแปลง JSON ของ Gemini
 * สามารถกด Run จากหน้า Apps Script Editor ได้ทันทีโดยไม่บันทึกลงชีตจริง
 */
function testInterpretWithGemini_() {
  const samples = [
    {
      label: "รายงานสต็อกหลายรายการ",
      text: "สต็อก 17/9/69\nกะหล่ำ 5,800 โล\nหอม AFT 41,740 โล\nหอมจีน 4,437 โล\nแครอท 6,250 โล"
    },
    {
      label: "งานขึ้นของส่งโรงงาน",
      text: "เฮียหนิงขึ้นกะหล่ำ 8 ตัน บ่อสลี ส่งโรงงานศาลายา 21/9"
    },
    {
      label: "แจ้งยกเลิกงาน",
      text: "ขอยกเลิกงานกะหล่ำปลีเข้าศาลายาวันที่ 20/9 เนื่องจากฝนตกหนักหน้าสวน"
    },
    {
      label: "สำรวจราคาหน้าสวน",
      text: "ราคากะหล่ำวันนี้ 17/9 ป้าผา 14 บาท 6ล้อ 15000, เฮียหนิง 13.50 บาท 6ล้อ 14000 พันธุ์ช้างสวย"
    },
    {
      label: "ข้อความคุยเล่นทั่วไป (ต้องถูกกรองเป็น none)",
      text: "สวัสดีครับ วันนี้มีประชุมไหมครับ ทานข้าวหรือยัง"
    }
  ];

  Logger.log("=== เริ่มการทดสอบ Gemini Parser Dry-Run (" + samples.length + " ตัวอย่าง) ===");
  samples.forEach(function(s, idx) {
    Logger.log("\n--- [Test " + (idx + 1) + "] " + s.label + " ---");
    Logger.log("Input: " + s.text);
    const kwPattern = getKeyWordPattern_();
    const passedKw = kwPattern.test(s.text);
    Logger.log("Keyword Filter: " + (passedKw ? "PASS" : "SKIPPED (Casual)"));

    if (passedKw) {
      const result = interpretWithGemini(s.text);
      Logger.log("Parsed Result: " + JSON.stringify(result, null, 2));
    }
  });
  Logger.log("\n=== สิ้นสุดการทดสอบ Dry-Run ===");
}
