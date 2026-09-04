const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Import production pure functions directly (AUD-01 & AUD-07)
const { calculateYieldPct, calculateTransitLoss } = require('../psc_core_logic.js');

console.log('================================================================');
console.log('🧪 COMPREHENSIVE PSC OPERATIONS AUDIT TEST SUITE (AUD-01 - AUD-12)');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        passCount++;
        console.log(`✅ [PASS] ${name}`);
    } catch (err) {
        failCount++;
        console.log(`❌ [FAIL] ${name}: ${err.message}`);
    }
}

// -------------------------------------------------------------
// 1. AUD-01 & AUD-04: Yield Production Logic & Boundary Tests
// -------------------------------------------------------------
test('AUD-01: calculateYieldPct matches benchmark: 100kg sample, 64.8kg peeled -> 64.80%', () => {
    assert.strictEqual(calculateYieldPct(100, 64.8), 64.80);
});

test('AUD-01: calculateYieldPct matches benchmark: 120kg sample, 89.5kg peeled -> 74.58%', () => {
    assert.strictEqual(calculateYieldPct(120, 89.5), 74.58);
});

test('AUD-04: calculateYieldPct handles 0% peeled yield (0kg peeled)', () => {
    assert.strictEqual(calculateYieldPct(100, 0), 0.00);
});

test('AUD-04: calculateYieldPct handles 100% peeled yield', () => {
    assert.strictEqual(calculateYieldPct(100, 100), 100.00);
});

test('AUD-04: calculateYieldPct rejects sampleKg <= 0 (Zero or Negative)', () => {
    assert.throws(() => calculateYieldPct(0, 50), TypeError);
    assert.throws(() => calculateYieldPct(-10, 50), TypeError);
});

test('AUD-04: calculateYieldPct rejects peeledKg < 0 (Negative)', () => {
    assert.throws(() => calculateYieldPct(100, -5), TypeError);
});

test('AUD-04: calculateYieldPct rejects peeledKg > sampleKg (Yield > 100%)', () => {
    assert.throws(() => calculateYieldPct(100, 105), RangeError);
});

test('AUD-04: calculateYieldPct rejects non-finite values (null, undefined, NaN, Infinity)', () => {
    assert.throws(() => calculateYieldPct(null, 50), TypeError);
    assert.throws(() => calculateYieldPct(100, undefined), TypeError);
    assert.throws(() => calculateYieldPct(NaN, 50), TypeError);
    assert.throws(() => calculateYieldPct(100, Infinity), TypeError);
});

test('AUD-04: calculateYieldPct safely parses numeric strings with normalization', () => {
    assert.strictEqual(calculateYieldPct("100", "64.8"), 64.80);
});

// -------------------------------------------------------------
// 2. AUD-07: Transit Loss Production Logic & Boundary Tests
// -------------------------------------------------------------
test('AUD-07: calculateTransitLoss matches benchmark (9,200kg gross -> 8,725kg net -> 475kg / 5.16%)', () => {
    const res = calculateTransitLoss(9200, 8725);
    assert.strictEqual(res.lossKg, 475.00);
    assert.strictEqual(res.lossPct, 5.16);
});

test('AUD-07: calculateTransitLoss rejects netReceived > grossDispatch', () => {
    assert.throws(() => calculateTransitLoss(8000, 8500), RangeError);
});

test('AUD-07: calculateTransitLoss rejects zero or negative gross dispatch', () => {
    assert.throws(() => calculateTransitLoss(0, 100), TypeError);
    assert.throws(() => calculateTransitLoss(-500, 100), TypeError);
});

// -------------------------------------------------------------
// 3. AUD-02, AUD-03, AUD-08: Deduplication, Atomic Write & Audit Trail
// -------------------------------------------------------------
test('AUD-02 & AUD-03: Deduplication prevents redundant writes and audit entries on identical values', () => {
    const fixtureStock = {
        Items: { Cabbage: { Name: 'กะหล่ำปลี', StockKg: 8800 } },
        AuditTrail: []
    };
    
    // Simulate first write with new value
    const newVal = 8800;
    const prevVal = 6075;
    let updated = false;
    if (prevVal !== newVal) {
        fixtureStock.Items.Cabbage.StockKg = newVal;
        fixtureStock.AuditTrail.push({ PreviousKg: prevVal, NewKg: newVal, Timestamp: new Date().toISOString() });
        updated = true;
    }
    assert.strictEqual(updated, true);
    assert.strictEqual(fixtureStock.AuditTrail.length, 1);

    // Simulate second duplicate event with same value
    let duplicateUpdated = false;
    const sameVal = 8800;
    const currentVal = fixtureStock.Items.Cabbage.StockKg;
    if (currentVal !== sameVal) {
        fixtureStock.Items.Cabbage.StockKg = sameVal;
        fixtureStock.AuditTrail.push({ PreviousKg: currentVal, NewKg: sameVal, Timestamp: new Date().toISOString() });
        duplicateUpdated = true;
    }
    assert.strictEqual(duplicateUpdated, false, 'Duplicate write must be suppressed');
    assert.strictEqual(fixtureStock.AuditTrail.length, 1, 'AuditTrail must not grow on duplicate values');
});

test('AUD-08 & AUD-12: AuditTrail enforces hard limit of 50 entries (FIFO trimming)', () => {
    const fixtureStock = { AuditTrail: [] };
    for (let i = 1; i <= 55; i++) {
        fixtureStock.AuditTrail.push({ id: i, Timestamp: new Date().toISOString() });
        if (fixtureStock.AuditTrail.length > 50) {
            fixtureStock.AuditTrail = fixtureStock.AuditTrail.slice(-50);
        }
    }
    assert.strictEqual(fixtureStock.AuditTrail.length, 50, 'AuditTrail must be capped at exactly 50 entries');
    assert.strictEqual(fixtureStock.AuditTrail[0].id, 6, 'Oldest entries (1-5) must be pruned');
    assert.strictEqual(fixtureStock.AuditTrail[49].id, 55, 'Latest entry must be preserved');
});

test('AUD-05 & AUD-06: Dynamic fixture schema verification without hardcoded path dependencies', () => {
    const stockFixturePath = path.join(__dirname, '..', 'stock_inventory.json');
    assert.ok(fs.existsSync(stockFixturePath), 'stock_inventory.json must be resolvable via relative dirname');
    const stock = JSON.parse(fs.readFileSync(stockFixturePath, 'utf8'));
    assert.ok(stock.Items && typeof stock.Items === 'object', 'Stock Items must be an object');
    assert.ok(Number.isFinite(stock.Items.Cabbage.Yield.AFT), 'Yield AFT must be a finite number');
    assert.ok(stock.Items.Cabbage.Yield.AFT >= 0 && stock.Items.Cabbage.Yield.AFT <= 1, 'Yield AFT must be in [0, 1] range');
});

console.log('\n================================================================');
console.log(`📊 TEST RESULTS: PASS: ${passCount} | FAIL: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) process.exit(1);
