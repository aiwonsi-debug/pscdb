"use strict";

const assert = require("assert");

const {
  MAX_AUDIT_ENTRIES,
  calculateYieldPct,
  yieldPctToFactor,
  applyStockUpdate,
  applyYieldUpdate
} = require("./business_logic");

let passCount = 0;
let failCount = 0;

function runTest(testName, fn) {
  try {
    fn();
    passCount += 1;
    console.log(`PASS: ${testName}`);
  } catch (error) {
    failCount += 1;
    console.error(`FAIL: ${testName}`);
    console.error(`  ${error.stack || error.message}`);
  }
}

function createStock(overrides = {}) {
  return {
    Items: {
      Cabbage: {
        StockKg: 100,
        Yield: {
          AFT: 0.648
        }
      }
    },
    AuditTrail: [],
    ProcessedEvents: [],
    ...overrides
  };
}

function createUpdate(overrides = {}) {
  return {
    itemKey: "Cabbage",
    newKg: 80,
    source: "Telegram",
    timestamp: "2026-09-04T10:00:00.000Z",
    eventId: "telegram:100:200",
    ...overrides
  };
}

/* ============================================================
 * Yield Calculation Tests
 * ============================================================
 */
runTest("Y-01: Yield 64.8 / 100 must equal 64.8%", () => {
  assert.strictEqual(calculateYieldPct(100, 64.8), 64.8);
});

runTest("Y-02: Yield 89.5 / 120 must equal 74.58%", () => {
  assert.strictEqual(calculateYieldPct(120, 89.5), 74.58);
});

runTest("Y-03: Peeled weight zero must return 0%", () => {
  assert.strictEqual(calculateYieldPct(100, 0), 0);
});

runTest("Y-04: Sample weight zero must be rejected", () => {
  assert.throws(() => calculateYieldPct(0, 10), /sampleKg must be greater than zero/);
});

runTest("Y-05: Negative sample weight must be rejected", () => {
  assert.throws(() => calculateYieldPct(-100, 10), /sampleKg must be greater than zero/);
});

runTest("Y-06: Negative peeled weight must be rejected", () => {
  assert.throws(() => calculateYieldPct(100, -1), /peeledKg must not be negative/);
});

runTest("Y-07: null input must be rejected", () => {
  assert.throws(() => calculateYieldPct(null, 10), /sampleKg must be a finite number/);
});

runTest("Y-08: NaN input must be rejected", () => {
  assert.throws(() => calculateYieldPct(100, NaN), /peeledKg must be a finite number/);
});

runTest("Y-09: Infinity input must be rejected", () => {
  assert.throws(() => calculateYieldPct(Infinity, 10), /sampleKg must be a finite number/);
});

runTest("Y-10: Numeric strings must be normalized", () => {
  assert.strictEqual(calculateYieldPct("100", "64.8"), 64.8);
});

runTest("Y-11: Non-numeric strings must be rejected", () => {
  assert.throws(() => calculateYieldPct("abc", "64.8"), /sampleKg must be a finite number/);
});

runTest("Y-12: Yield over 100% must require manual review", () => {
  assert.throws(() => calculateYieldPct(100, 101), /manual verification is required/);
});

runTest("Y-13: Yield percentage converts to decimal factor", () => {
  assert.strictEqual(yieldPctToFactor(64.8), 0.648);
});

runTest("Y-14: Yield factor rejects percentage over 100", () => {
  assert.throws(() => yieldPctToFactor(100.01), /yieldPct must be between 0 and 100/);
});

/* ============================================================
 * Yield Idempotency & Lifecycle Tests (AUD-02 & AUD-03)
 * ============================================================
 */
runTest("Y-15: applyYieldUpdate modifies Yield.AFT and creates standard AuditTrail", () => {
  const stock = createStock();
  const res = applyYieldUpdate(stock, {
    itemKey: "Cabbage",
    subKey: "AFT",
    newYieldFactor: 0.70,
    source: "Telegram Test",
    timestamp: "2026-09-04T10:00:00.000Z",
    eventId: "telegram:update:901:Yield"
  });

  assert.strictEqual(res.yieldChanged, true);
  assert.strictEqual(res.persistRequired, true);
  assert.strictEqual(res.auditAdded, true);
  assert.strictEqual(res.data.Items.Cabbage.Yield.AFT, 0.70);
  assert.strictEqual(res.data.AuditTrail[0].Unit, "factor");
  assert.strictEqual(res.data.AuditTrail[0].PreviousValue, 0.648);
  assert.strictEqual(res.data.AuditTrail[0].NewValue, 0.70);
});

runTest("Y-16: applyYieldUpdate rejects duplicate event ID (Idempotency)", () => {
  const stock = createStock();
  const update = {
    itemKey: "Cabbage",
    subKey: "AFT",
    newYieldFactor: 0.70,
    source: "Telegram Test",
    timestamp: "2026-09-04T10:00:00.000Z",
    eventId: "telegram:update:902:Yield"
  };

  const res1 = applyYieldUpdate(stock, update);
  const res2 = applyYieldUpdate(res1.data, update);

  assert.strictEqual(res2.yieldChanged, false);
  assert.strictEqual(res2.persistRequired, false);
  assert.strictEqual(res2.auditAdded, false);
  assert.strictEqual(res2.reason, "duplicate_event");
  assert.strictEqual(res2.data.AuditTrail.length, 1);
});

runTest("Y-17: applyYieldUpdate with same value triggers persistRequired to save ProcessedEvents", () => {
  const stock = createStock(); // AFT is 0.648
  const res = applyYieldUpdate(stock, {
    itemKey: "Cabbage",
    subKey: "AFT",
    newYieldFactor: 0.648,
    source: "Telegram Test",
    timestamp: "2026-09-04T10:00:00.000Z",
    eventId: "telegram:update:903:Yield"
  });

  assert.strictEqual(res.yieldChanged, false);
  assert.strictEqual(res.persistRequired, true);
  assert.strictEqual(res.auditAdded, false);
  assert.strictEqual(res.reason, "same_value");
  assert.ok(res.data.ProcessedEvents.includes("telegram:update:903:Yield"));
});

/* ============================================================
 * Stock Deduplication & Event Tests
 * ============================================================
 */
runTest("D-01: Same stock value must trigger persistRequired but not create audit entry", () => {
  const stock = createStock();
  const result = applyStockUpdate(stock, createUpdate({ newKg: 100, eventId: "telegram:100:201" }));

  assert.strictEqual(result.stockChanged, false);
  assert.strictEqual(result.persistRequired, true, "Must persist to save ProcessedEvents");
  assert.strictEqual(result.auditAdded, false);
  assert.strictEqual(result.reason, "same_value");
  assert.strictEqual(result.data.AuditTrail.length, 0);
  assert.strictEqual(result.data.Items.Cabbage.StockKg, 100);
});

runTest("D-02: Number and numeric string must be treated equally", () => {
  const stock = createStock();
  const result = applyStockUpdate(stock, createUpdate({ newKg: "100", eventId: "telegram:100:202" }));

  assert.strictEqual(result.stockChanged, false);
  assert.strictEqual(result.persistRequired, true);
  assert.strictEqual(result.auditAdded, false);
  assert.strictEqual(result.data.AuditTrail.length, 0);
});

runTest("D-03: First event must update stock once", () => {
  const stock = createStock();
  const update = createUpdate();
  const result = applyStockUpdate(stock, update);

  assert.strictEqual(result.stockChanged, true);
  assert.strictEqual(result.persistRequired, true);
  assert.strictEqual(result.auditAdded, true);
  assert.strictEqual(result.reason, "updated");
  assert.strictEqual(result.data.Items.Cabbage.StockKg, 80);
  assert.strictEqual(result.data.AuditTrail.length, 1);
});

runTest("D-04: Repeated event ID must have no second effect", () => {
  const stock = createStock();
  const update = createUpdate();

  const firstResult = applyStockUpdate(stock, update);
  const secondResult = applyStockUpdate(firstResult.data, update);

  assert.strictEqual(secondResult.stockChanged, false);
  assert.strictEqual(secondResult.persistRequired, false);
  assert.strictEqual(secondResult.auditAdded, false);
  assert.strictEqual(secondResult.reason, "duplicate_event");
  assert.strictEqual(secondResult.data.Items.Cabbage.StockKg, 80);
  assert.strictEqual(secondResult.data.AuditTrail.length, 1);
});

runTest("D-05: Duplicate event ID with different payload must not overwrite stock", () => {
  const stock = createStock();
  const firstResult = applyStockUpdate(stock, createUpdate({ newKg: 80, eventId: "telegram:100:203" }));
  const duplicateResult = applyStockUpdate(firstResult.data, createUpdate({ newKg: 25, eventId: "telegram:100:203" }));

  assert.strictEqual(duplicateResult.reason, "duplicate_event");
  assert.strictEqual(duplicateResult.data.Items.Cabbage.StockKg, 80);
  assert.strictEqual(duplicateResult.data.AuditTrail.length, 1);
});

runTest("D-06: Different event IDs may update stock normally", () => {
  const firstResult = applyStockUpdate(createStock(), createUpdate({ newKg: 80, eventId: "telegram:100:204" }));
  const secondResult = applyStockUpdate(firstResult.data, createUpdate({ newKg: 70, eventId: "telegram:100:205", timestamp: "2026-09-04T10:05:00.000Z" }));

  assert.strictEqual(secondResult.stockChanged, true);
  assert.strictEqual(secondResult.data.Items.Cabbage.StockKg, 70);
  assert.strictEqual(secondResult.data.AuditTrail.length, 2);
});

/* ============================================================
 * Audit Trail Tests
 * ============================================================
 */
runTest("A-01: Stock change must create one audit entry", () => {
  const result = applyStockUpdate(createStock(), createUpdate());
  assert.strictEqual(result.data.AuditTrail.length, 1);
});

runTest("A-02: Audit entry must contain standard schema with Field, Unit and EventId", () => {
  const result = applyStockUpdate(createStock(), createUpdate());
  const audit = result.data.AuditTrail[0];

  assert.deepStrictEqual(audit, {
    Timestamp: "2026-09-04T10:00:00.000Z",
    ItemKey: "Cabbage",
    Field: "StockKg",
    PreviousValue: 100,
    NewValue: 80,
    Unit: "kg",
    Source: "Telegram",
    EventId: "telegram:100:200"
  });
});

runTest("A-03: Invalid timestamp must be rejected", () => {
  assert.throws(() => applyStockUpdate(createStock(), createUpdate({ timestamp: "not-a-date" })), /timestamp must be a valid date/);
});

runTest("A-04: Missing source must be rejected", () => {
  assert.throws(() => applyStockUpdate(createStock(), createUpdate({ source: "" })), /source is required/);
});

runTest("A-05: Missing event ID must be rejected", () => {
  assert.throws(() => applyStockUpdate(createStock(), createUpdate({ eventId: "" })), /eventId is required/);
});

runTest("A-06: Audit Trail must retain only latest 50 entries", () => {
  let stock = createStock();
  for (let index = 1; index <= 51; index += 1) {
    const result = applyStockUpdate(stock, createUpdate({
      newKg: 100 + index,
      eventId: `telegram:limit:${index}`,
      timestamp: new Date(Date.UTC(2026, 8, 4, 10, index, 0)).toISOString()
    }));
    stock = result.data;
  }

  assert.strictEqual(stock.AuditTrail.length, MAX_AUDIT_ENTRIES);
  assert.strictEqual(stock.AuditTrail[0].EventId, "telegram:limit:2");
  assert.strictEqual(stock.AuditTrail[49].EventId, "telegram:limit:51");
});

runTest("A-07: Original stock object must not be mutated (Immutability)", () => {
  const originalStock = createStock();
  const originalSnapshot = JSON.stringify(originalStock);
  applyStockUpdate(originalStock, createUpdate({ newKg: 75 }));
  assert.strictEqual(JSON.stringify(originalStock), originalSnapshot);
});

/* ============================================================
 * Validation Tests
 * ============================================================
 */
runTest("V-01: Unknown item must be rejected", () => {
  assert.throws(() => applyStockUpdate(createStock(), createUpdate({ itemKey: "UnknownItem" })), /Unknown stock item/);
});

runTest("V-02: Negative stock must be rejected", () => {
  assert.throws(() => applyStockUpdate(createStock(), createUpdate({ newKg: -1 })), /newKg must not be negative/);
});

console.log("");
console.log("========================================");
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log("========================================");

if (failCount > 0) process.exitCode = 1;
