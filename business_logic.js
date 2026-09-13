"use strict";

const MAX_AUDIT_ENTRIES = 50;
const MAX_PROCESSED_EVENTS = 1000;

/**
 * แปลง input เป็น finite number
 * ยอมรับ number และ numeric string เช่น "64.8"
 */
function toFiniteNumber(value, fieldName) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw new TypeError(`${fieldName} must be a finite number`);
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new TypeError(`${fieldName} must be a finite number`);
  }

  return numericValue;
}

/**
 * คำนวณ Yield เป็นเปอร์เซ็นต์
 *
 * ตัวอย่าง:
 * sampleKg = 100
 * peeledKg = 64.8
 * ผลลัพธ์ = 64.8
 */
function calculateYieldPct(sampleKg, peeledKg) {
  const sample = toFiniteNumber(sampleKg, "sampleKg");
  const peeled = toFiniteNumber(peeledKg, "peeledKg");

  if (sample <= 0) {
    throw new RangeError("sampleKg must be greater than zero");
  }

  if (peeled < 0) {
    throw new RangeError("peeledKg must not be negative");
  }

  if (peeled > sample) {
    throw new RangeError(
      "peeledKg exceeds sampleKg; manual verification is required"
    );
  }

  return Math.round((peeled / sample) * 10000) / 100;
}

/**
 * แปลง Yield เปอร์เซ็นต์เป็น factor สำหรับจัดเก็บ
 *
 * ตัวอย่าง:
 * 64.8% -> 0.648
 */
function yieldPctToFactor(yieldPct) {
  const percentage = toFiniteNumber(yieldPct, "yieldPct");

  if (percentage < 0 || percentage > 100) {
    throw new RangeError("yieldPct must be between 0 and 100");
  }

  return Math.round((percentage / 100) * 1000000) / 1000000;
}

function cloneData(value) {
  return structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function validateStockStructure(stock, itemKey) {
  if (!stock || typeof stock !== "object" || Array.isArray(stock)) {
    throw new TypeError("stock must be an object");
  }

  if (!stock.Items || typeof stock.Items !== "object") {
    throw new TypeError("stock.Items must be an object");
  }

  if (
    !Object.prototype.hasOwnProperty.call(stock.Items, itemKey) ||
    !stock.Items[itemKey] ||
    typeof stock.Items[itemKey] !== "object"
  ) {
    throw new Error(`Unknown stock item: ${itemKey}`);
  }
}

/**
 * อัปเดต Stock แบบ pure operation พร้อม Event-level Idempotency
 */
function applyStockUpdate(stock, update) {
  if (!update || typeof update !== "object") {
    throw new TypeError("update must be an object");
  }

  const {
    itemKey,
    newKg,
    source,
    timestamp,
    eventId
  } = update;

  if (typeof itemKey !== "string" || itemKey.trim() === "") {
    throw new TypeError("itemKey is required");
  }

  if (typeof eventId !== "string" || eventId.trim() === "") {
    throw new TypeError("eventId is required");
  }

  if (typeof source !== "string" || source.trim() === "") {
    throw new TypeError("source is required");
  }

  const parsedTimestamp = new Date(timestamp);

  if (!timestamp || Number.isNaN(parsedTimestamp.getTime())) {
    throw new TypeError("timestamp must be a valid date");
  }

  validateStockStructure(stock, itemKey);

  const nextData = cloneData(stock);

  if (!Array.isArray(nextData.AuditTrail)) {
    nextData.AuditTrail = [];
  }

  if (!Array.isArray(nextData.ProcessedEvents)) {
    nextData.ProcessedEvents = [];
  }

  /*
   * Event-level idempotency:
   * Event ID ที่เคยประมวลผลแล้วต้องไม่มีผลซ้ำ
   */
  if (nextData.ProcessedEvents.includes(eventId)) {
    return {
      data: nextData,
      stockChanged: false,
      persistRequired: false,
      auditAdded: false,
      reason: "duplicate_event"
    };
  }

  const previousKg = toFiniteNumber(
    nextData.Items[itemKey].StockKg,
    "previousKg"
  );

  const normalizedNewKg = toFiniteNumber(newKg, "newKg");

  if (normalizedNewKg < 0) {
    throw new RangeError("newKg must not be negative");
  }

  /*
   * บันทึก Event ID เสมอเพื่อรักษา Idempotency History
   */
  nextData.ProcessedEvents.push(eventId);

  if (nextData.ProcessedEvents.length > MAX_PROCESSED_EVENTS) {
    nextData.ProcessedEvents =
      nextData.ProcessedEvents.slice(-MAX_PROCESSED_EVENTS);
  }

  /*
   * แม้ค่าเดิมเท่าค่าใหม่ ก็ต้อง persistRequired: true เพื่อบันทึก ProcessedEvents
   */
  if (previousKg === normalizedNewKg) {
    return {
      data: nextData,
      stockChanged: false,
      persistRequired: true,
      auditAdded: false,
      reason: "same_value"
    };
  }

  nextData.Items[itemKey].StockKg = normalizedNewKg;

  nextData.AuditTrail.push({
    Timestamp: parsedTimestamp.toISOString(),
    ItemKey: itemKey,
    Field: "StockKg",
    PreviousValue: previousKg,
    NewValue: normalizedNewKg,
    Unit: "kg",
    Source: source,
    EventId: eventId
  });

  if (nextData.AuditTrail.length > MAX_AUDIT_ENTRIES) {
    nextData.AuditTrail =
      nextData.AuditTrail.slice(-MAX_AUDIT_ENTRIES);
  }

  return {
    data: nextData,
    stockChanged: true,
    persistRequired: true,
    auditAdded: true,
    reason: "updated"
  };
}

/**
 * อัปเดต Yield แบบ pure operation พร้อม Event-level Idempotency และ Audit Schema มาตรฐาน
 */
function applyYieldUpdate(stock, update) {
  if (!update || typeof update !== "object") {
    throw new TypeError("update must be an object");
  }

  const {
    itemKey = "Cabbage",
    subKey = "AFT",
    newYieldFactor,
    source,
    timestamp,
    eventId
  } = update;

  if (typeof eventId !== "string" || eventId.trim() === "") {
    throw new TypeError("eventId is required");
  }

  if (typeof source !== "string" || source.trim() === "") {
    throw new TypeError("source is required");
  }

  const parsedTimestamp = new Date(timestamp);
  if (!timestamp || Number.isNaN(parsedTimestamp.getTime())) {
    throw new TypeError("timestamp must be a valid date");
  }

  validateStockStructure(stock, itemKey);

  const nextData = cloneData(stock);

  if (!nextData.Items[itemKey].Yield) {
    nextData.Items[itemKey].Yield = {};
  }

  if (!Array.isArray(nextData.AuditTrail)) {
    nextData.AuditTrail = [];
  }

  if (!Array.isArray(nextData.ProcessedEvents)) {
    nextData.ProcessedEvents = [];
  }

  // Event-level Idempotency check
  if (nextData.ProcessedEvents.includes(eventId)) {
    return {
      data: nextData,
      yieldChanged: false,
      persistRequired: false,
      auditAdded: false,
      reason: "duplicate_event"
    };
  }

  const normalizedFactor = toFiniteNumber(newYieldFactor, "newYieldFactor");
  if (normalizedFactor < 0 || normalizedFactor > 1) {
    throw new RangeError("newYieldFactor must be between 0 and 1");
  }

  const previousYield = nextData.Items[itemKey].Yield[subKey] !== undefined
    ? toFiniteNumber(nextData.Items[itemKey].Yield[subKey], "previousYield")
    : 0.60;

  nextData.ProcessedEvents.push(eventId);
  if (nextData.ProcessedEvents.length > MAX_PROCESSED_EVENTS) {
    nextData.ProcessedEvents = nextData.ProcessedEvents.slice(-MAX_PROCESSED_EVENTS);
  }

  if (previousYield === normalizedFactor) {
    return {
      data: nextData,
      yieldChanged: false,
      persistRequired: true,
      auditAdded: false,
      reason: "same_value"
    };
  }

  nextData.Items[itemKey].Yield[subKey] = normalizedFactor;

  nextData.AuditTrail.push({
    Timestamp: parsedTimestamp.toISOString(),
    ItemKey: `${itemKey}_Yield_${subKey}`,
    Field: `Yield.${subKey}`,
    PreviousValue: previousYield,
    NewValue: normalizedFactor,
    Unit: "factor",
    Source: source,
    EventId: eventId
  });

  if (nextData.AuditTrail.length > MAX_AUDIT_ENTRIES) {
    nextData.AuditTrail = nextData.AuditTrail.slice(-MAX_AUDIT_ENTRIES);
  }

  return {
    data: nextData,
    yieldChanged: true,
    persistRequired: true,
    auditAdded: true,
    reason: "updated"
  };
}

module.exports = {
  MAX_AUDIT_ENTRIES,
  MAX_PROCESSED_EVENTS,
  toFiniteNumber,
  calculateYieldPct,
  yieldPctToFactor,
  applyStockUpdate,
  applyYieldUpdate
};
