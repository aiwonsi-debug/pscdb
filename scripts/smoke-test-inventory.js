'use strict';

/**
 * scripts/smoke-test-inventory.js
 *
 * à¸§à¸´à¸˜à¸µà¹ƒà¸Šà¹‰:
 *   node scripts/smoke-test-inventory.js
 *
 * à¹€à¸¥à¸·à¸­à¸ item:
 *   node scripts/smoke-test-inventory.js Cabbage
 *
 * à¸£à¸°à¸šà¸¸à¹„à¸Ÿà¸¥à¹Œà¸•à¹‰à¸™à¸—à¸²à¸‡:
 *   STOCK_INVENTORY_PATH="E:\agy\stock_inventory.json" node scripts/smoke-test-inventory.js
 *
 * à¹€à¸à¹‡à¸š temporary test folder à¹„à¸§à¹‰à¹€à¸žà¸·à¹ˆà¸­à¸•à¸£à¸§à¸ˆà¹€à¸­à¸‡:
 *   KEEP_SMOKE_TEST_DATA=true node scripts/smoke-test-inventory.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createJsonFileStore
} = require('../repositories/json-file-store');

const {
  createInventoryRepository
} = require('../repositories/inventory-repository');

const RECEIVE_KG = 2.5;
const LOAD_KG = 0.75;
const EXPECTED_NET_CHANGE_KG = RECEIVE_KG - LOAD_KG;

async function main() {
  const itemKey = process.argv[2] || 'Cabbage';
  const sourceFilePath = resolveSourceInventoryPath();
  const tempDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'agy-inventory-smoke-')
  );
  const testFilePath = path.join(
    tempDirectory,
    'stock_inventory.json'
  );

  let shouldKeepTempDirectory =
    String(process.env.KEEP_SMOKE_TEST_DATA || '').toLowerCase() === 'true';

  try {
    console.log('=== AGY Inventory Smoke Test ===');
    console.log(`Source file: ${sourceFilePath}`);
    console.log(`Test file:   ${testFilePath}`);
    console.log(`Item key:    ${itemKey}`);

    await fs.promises.copyFile(sourceFilePath, testFilePath);

    const originalSnapshot = await readJson(testFilePath);

    assertInventoryRootSchema(originalSnapshot);
    assert.ok(
      originalSnapshot.Items[itemKey],
      `Item "${itemKey}" was not found in Items`
    );

    const originalSchema = captureProtectedSchema(originalSnapshot);
    const originalStockKg = readStockKg(
      originalSnapshot.Items[itemKey],
      itemKey
    );
    const originalAuditCount = originalSnapshot.AuditTrail.length;
    const originalProcessedEventCount =
      originalSnapshot.ProcessedEvents.length;

    console.log(`Original stock: ${originalStockKg} kg`);

    const logger = createTestLogger();
    const state = {
      inventoryCache: null,
      inventoryCacheUpdatedAt: 0,
      inventoryWriteQueueDepth: 0
    };

    const fileStore = createJsonFileStore({ logger });

    const repository = createInventoryRepository({
      fileStore,
      filePath: testFilePath,
      logger,
      state
    });

    /*
     * Test 1: à¸£à¸±à¸šà¸ªà¸´à¸™à¸„à¹‰à¸²à¹€à¸‚à¹‰à¸²
     */
    const receiveEventId = createEventId('receive', itemKey);

    const receiveResult = await repository.applyStockChange({
      itemKey,
      deltaKg: RECEIVE_KG,
      action: 'RECEIVE',
      reason: 'Smoke test receive stock',
      note: 'Temporary smoke-test data only',
      source: 'SMOKE_TEST',
      reference: 'SMOKE-RECEIVE-001',
      actor: 'smoke-test-script',
      eventId: receiveEventId
    });

    assert.strictEqual(
      receiveResult.duplicate,
      false,
      'First receive operation must not be marked as duplicate'
    );

    assert.strictEqual(
      receiveResult.stockKg,
      roundKg(originalStockKg + RECEIVE_KG),
      'Receive operation produced an unexpected stock balance'
    );

    console.log(
      `PASS: Receive +${RECEIVE_KG} kg => ${receiveResult.stockKg} kg`
    );

    /*
     * Test 2: à¸ªà¹ˆà¸‡ event à¸£à¸±à¸šà¸ªà¸´à¸™à¸„à¹‰à¸²à¹€à¸”à¸´à¸¡à¸‹à¹‰à¸³
     * à¸•à¹‰à¸­à¸‡à¹„à¸¡à¹ˆà¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸¢à¸­à¸” à¹„à¸¡à¹ˆà¹€à¸žà¸´à¹ˆà¸¡ AuditTrail à¹à¸¥à¸°à¹„à¸¡à¹ˆà¹€à¸žà¸´à¹ˆà¸¡ ProcessedEvents
     */
    const snapshotBeforeDuplicate = await repository.getSnapshot({
      fresh: true
    });

    const duplicateResult = await repository.applyStockChange({
      itemKey,
      deltaKg: RECEIVE_KG,
      action: 'RECEIVE',
      reason: 'Smoke test receive stock',
      note: 'This must be identified as a duplicate event',
      source: 'SMOKE_TEST',
      reference: 'SMOKE-RECEIVE-001',
      actor: 'smoke-test-script',
      eventId: receiveEventId
    });

    const snapshotAfterDuplicate = await repository.getSnapshot({
      fresh: true
    });

    assert.strictEqual(
      duplicateResult.duplicate,
      true,
      'Second operation with the same eventId must be duplicate'
    );

    assert.strictEqual(
      duplicateResult.stockKg,
      receiveResult.stockKg,
      'Duplicate event must not change stock'
    );

    assert.strictEqual(
      snapshotAfterDuplicate.AuditTrail.length,
      snapshotBeforeDuplicate.AuditTrail.length,
      'Duplicate event must not create another AuditTrail record'
    );

    assert.strictEqual(
      snapshotAfterDuplicate.ProcessedEvents.length,
      snapshotBeforeDuplicate.ProcessedEvents.length,
      'Duplicate event must not add another ProcessedEvents record'
    );

    console.log(
      'PASS: Duplicate event was ignored without changing stock or audit data'
    );

    /*
     * Test 3: à¸•à¸±à¸”à¸ªà¸´à¸™à¸„à¹‰à¸²à¸­à¸­à¸
     */
    const loadEventId = createEventId('load', itemKey);

    const loadResult = await repository.applyStockChange({
      itemKey,
      deltaKg: -LOAD_KG,
      action: 'LOAD',
      reason: 'Smoke test load stock',
      note: 'Temporary smoke-test data only',
      source: 'SMOKE_TEST',
      reference: 'SMOKE-LOAD-001',
      actor: 'smoke-test-script',
      eventId: loadEventId
    });

    const expectedFinalStockKg = roundKg(
      originalStockKg + EXPECTED_NET_CHANGE_KG
    );

    assert.strictEqual(
      loadResult.duplicate,
      false,
      'Load operation must not be marked as duplicate'
    );

    assert.strictEqual(
      loadResult.stockKg,
      expectedFinalStockKg,
      'Load operation produced an unexpected final stock balance'
    );

    console.log(
      `PASS: Load -${LOAD_KG} kg => ${loadResult.stockKg} kg`
    );

    /*
     * à¸•à¸£à¸§à¸ˆà¸œà¸¥à¸ªà¸¸à¸”à¸—à¹‰à¸²à¸¢à¸ˆà¸²à¸à¹„à¸Ÿà¸¥à¹Œà¸ˆà¸£à¸´à¸‡à¹ƒà¸™ temporary directory
     */
    const finalSnapshot = await readJson(testFilePath);

    assertInventoryRootSchema(finalSnapshot);
    assertProtectedSchemaUnchanged(
      originalSchema,
      finalSnapshot,
      itemKey
    );

    assert.strictEqual(
      readStockKg(finalSnapshot.Items[itemKey], itemKey),
      expectedFinalStockKg,
      'Final stock in JSON file does not match expected balance'
    );

    assert.strictEqual(
      finalSnapshot.AuditTrail.length,
      originalAuditCount + 2,
      'Expected exactly 2 new AuditTrail records: receive and load'
    );

    assert.strictEqual(
      finalSnapshot.ProcessedEvents.length,
      originalProcessedEventCount + 2,
      'Expected exactly 2 new ProcessedEvents records'
    );

    assert.ok(
      finalSnapshot.ProcessedEvents.includes(receiveEventId),
      'Receive eventId is missing from ProcessedEvents'
    );

    assert.ok(
      finalSnapshot.ProcessedEvents.includes(loadEventId),
      'Load eventId is missing from ProcessedEvents'
    );

    assert.strictEqual(
      finalSnapshot.ProcessedEvents.filter(
        (eventId) => eventId === receiveEventId
      ).length,
      1,
      'Receive eventId must appear exactly once'
    );

    assertAuditEventExists(finalSnapshot.AuditTrail, {
      eventId: receiveEventId,
      itemKey,
      expectedPreviousKg: originalStockKg,
      expectedNewKg: roundKg(originalStockKg + RECEIVE_KG)
    });

    assertAuditEventExists(finalSnapshot.AuditTrail, {
      eventId: loadEventId,
      itemKey,
      expectedPreviousKg: roundKg(originalStockKg + RECEIVE_KG),
      expectedNewKg: expectedFinalStockKg
    });

    assertIsoTimestamp(
      finalSnapshot.LastUpdated,
      'LastUpdated must be a valid ISO timestamp after updates'
    );

    console.log(
      'PASS: JSON root schema, item structure, non-stock fields, audit trail and processed events are valid'
    );

    console.log('');
    console.log('=== Smoke Test Passed ===');
    console.log(`Final expected stock: ${expectedFinalStockKg} kg`);
  } catch (error) {
    shouldKeepTempDirectory = true;

    console.error('');
    console.error('=== Smoke Test Failed ===');
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (shouldKeepTempDirectory) {
      console.log('');
      console.log(
        `Temporary test data kept for inspection: ${tempDirectory}`
      );
    } else {
      await fs.promises.rm(tempDirectory, {
        recursive: true,
        force: true
      });

      console.log('');
      console.log('Temporary test data removed.');
    }
  }
}

function resolveSourceInventoryPath() {
  if (process.env.STOCK_INVENTORY_PATH) {
    return path.resolve(process.env.STOCK_INVENTORY_PATH);
  }

  /*
   * Default:
   * project-root/
   *   stock_inventory.json
   *   scripts/smoke-test-inventory.js
   */
  return path.resolve(__dirname, '..', 'stock_inventory.json');
}

async function readJson(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

function createTestLogger() {
  return {
    debug() {},
    info() {},
    warn(...args) {
      console.warn('[smoke-test warning]', ...args);
    },
    error(...args) {
      console.error('[smoke-test error]', ...args);
    }
  };
}

/**
 * à¸•à¸£à¸§à¸ˆà¸Šà¸™à¸´à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹à¸¥à¸° root fields à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸¡à¸µà¹ƒà¸™ schema à¸ˆà¸£à¸´à¸‡
 */
function assertInventoryRootSchema(snapshot) {
  assert.ok(
    snapshot &&
    typeof snapshot === 'object' &&
    !Array.isArray(snapshot),
    'Inventory root must be an object'
  );

  assert.strictEqual(
    typeof snapshot.AsOfDate,
    'string',
    'AsOfDate must be a string'
  );

  assert.strictEqual(
    typeof snapshot.LastUpdated,
    'string',
    'LastUpdated must be a string'
  );

  assert.ok(
    snapshot.Items &&
    typeof snapshot.Items === 'object' &&
    !Array.isArray(snapshot.Items),
    'Items must be an object'
  );

  assert.ok(
    Array.isArray(snapshot.AuditTrail),
    'AuditTrail must be an array'
  );

  assert.ok(
    Array.isArray(snapshot.ProcessedEvents),
    'ProcessedEvents must be an array'
  );

  assert.ok(
    Array.isArray(snapshot.RecentAudits),
    'RecentAudits must be an array'
  );

  Object.entries(snapshot.Items).forEach(([itemKey, item]) => {
    assert.ok(
      item &&
      typeof item === 'object' &&
      !Array.isArray(item),
      `Items.${itemKey} must be an object`
    );

    assert.ok(
      Number.isFinite(Number(item.StockKg)),
      `Items.${itemKey}.StockKg must be a finite number`
    );

    if (item.Name !== undefined) {
      assert.strictEqual(
        typeof item.Name,
        'string',
        `Items.${itemKey}.Name must be a string`
      );
    }

    if (item.Yield !== undefined) {
      assert.ok(
        item.Yield &&
        typeof item.Yield === 'object' &&
        !Array.isArray(item.Yield),
        `Items.${itemKey}.Yield must be an object`
      );

      if (item.Yield.AFT !== undefined) {
        assert.ok(
          Number.isFinite(Number(item.Yield.AFT)),
          `Items.${itemKey}.Yield.AFT must be numeric`
        );
      }

      if (item.Yield.TNS !== undefined) {
        assert.ok(
          Number.isFinite(Number(item.Yield.TNS)),
          `Items.${itemKey}.Yield.TNS must be numeric`
        );
      }
    }
  });
}

/**
 * à¹€à¸à¹‡à¸š field à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸„à¸§à¸£à¸–à¸¹à¸à¹à¸à¹‰à¹‚à¸”à¸¢ stock transaction
 *
 * à¸­à¸™à¸¸à¸à¸²à¸•à¹ƒà¸«à¹‰à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¹€à¸‰à¸žà¸²à¸°:
 * - LastUpdated
 * - Items[itemKey].StockKg
 * - AuditTrail
 * - ProcessedEvents
 *
 * RecentAudits, AsOfDate, item names, yield à¹à¸¥à¸° field à¸­à¸·à¹ˆà¸™à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”
 * à¸•à¹‰à¸­à¸‡à¸„à¸‡à¸„à¹ˆà¸²à¹€à¸”à¸´à¸¡
 */
function captureProtectedSchema(snapshot) {
  const itemKeys = Object.keys(snapshot.Items).sort();
  const protectedItems = {};

  for (const itemKey of itemKeys) {
    const itemWithoutStock = cloneJson(snapshot.Items[itemKey]);
    delete itemWithoutStock.StockKg;

    protectedItems[itemKey] = itemWithoutStock;
  }

  return {
    rootKeys: Object.keys(snapshot).sort(),
    itemKeys,
    asOfDate: snapshot.AsOfDate,
    recentAudits: cloneJson(snapshot.RecentAudits),
    protectedItems
  };
}

function assertProtectedSchemaUnchanged(
  originalSchema,
  finalSnapshot,
  targetItemKey
) {
  assert.deepStrictEqual(
    Object.keys(finalSnapshot).sort(),
    originalSchema.rootKeys,
    'Root JSON keys changed unexpectedly'
  );

  assert.deepStrictEqual(
    Object.keys(finalSnapshot.Items).sort(),
    originalSchema.itemKeys,
    'Item keys changed unexpectedly'
  );

  assert.strictEqual(
    finalSnapshot.AsOfDate,
    originalSchema.asOfDate,
    'AsOfDate must not change during stock transactions'
  );

  assert.deepStrictEqual(
    finalSnapshot.RecentAudits,
    originalSchema.recentAudits,
    'RecentAudits must not change during regular stock transactions'
  );

  for (const itemKey of originalSchema.itemKeys) {
    const finalItemWithoutStock = cloneJson(finalSnapshot.Items[itemKey]);
    delete finalItemWithoutStock.StockKg;

    assert.deepStrictEqual(
      finalItemWithoutStock,
      originalSchema.protectedItems[itemKey],
      `Non-stock fields changed unexpectedly for item: ${itemKey}`
    );
  }

  assert.ok(
    finalSnapshot.Items[targetItemKey],
    `Target item "${targetItemKey}" disappeared after update`
  );
}

function assertAuditEventExists(auditTrail, {
  eventId,
  itemKey,
  expectedPreviousKg,
  expectedNewKg
}) {
  const auditEvent = auditTrail.find((event) => {
    return event &&
      event.EventId === eventId &&
      event.ItemKey === itemKey;
  });

  assert.ok(
    auditEvent,
    `AuditTrail entry not found for eventId: ${eventId}`
  );

  assert.strictEqual(
    Number(auditEvent.PreviousValue),
    expectedPreviousKg,
    `Audit PreviousValue mismatch for ${eventId}`
  );

  assert.strictEqual(
    Number(auditEvent.NewValue),
    expectedNewKg,
    `Audit NewValue mismatch for ${eventId}`
  );

  assert.strictEqual(
    auditEvent.Field,
    'StockKg',
    `Audit Field must be StockKg for ${eventId}`
  );

  assert.strictEqual(
    auditEvent.Unit,
    'kg',
    `Audit Unit must be kg for ${eventId}`
  );

  assertIsoTimestamp(
    auditEvent.Timestamp,
    `Audit Timestamp must be ISO timestamp for ${eventId}`
  );
}

function readStockKg(item, itemKey) {
  const stockKg = Number(item.StockKg);

  assert.ok(
    Number.isFinite(stockKg),
    `Items.${itemKey}.StockKg must be numeric`
  );

  return stockKg;
}

function assertIsoTimestamp(value, message) {
  assert.strictEqual(
    typeof value,
    'string',
    message
  );

  assert.ok(
    !Number.isNaN(Date.parse(value)),
    message
  );
}

function createEventId(action, itemKey) {
  return [
    'smoke-test',
    action,
    itemKey,
    process.pid,
    Date.now(),
    Math.random().toString(16).slice(2)
  ].join(':');
}

function roundKg(value) {
  return Math.round(
    (Number(value) + Number.EPSILON) * 1000
  ) / 1000;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

main();