'use strict';

/**
 * Repository สำหรับ stock_inventory.json
 *
 * Schema ที่รองรับ:
 * {
 *   AsOfDate: "14/09/26",
 *   LastUpdated: "2026-09-14T00:00:00.000Z",
 *   Items: {
 *     Cabbage: {
 *       Name: "กะหล่ำปลี",
 *       StockKg: 100,
 *       Yield: { AFT: 0.8, TNS: 0.7 }
 *     }
 *   },
 *   AuditTrail: [],
 *   ProcessedEvents: [],
 *   RecentAudits: []
 * }
 *
 * fileStore ต้องมี interface:
 * - read(filePath)
 * - update(filePath, mutator)
 * - getPendingWriteCount() (optional)
 *
 * สำคัญ: fileStore.update() ต้องส่ง snapshot ปัจจุบันเข้า mutator,
 * บันทึกค่าที่ mutator return และคืน snapshot ที่บันทึกแล้วกลับมา
 */
function createInventoryRepository({
  fileStore,
  filePath,
  logger,
  state
}) {
  if (!fileStore || typeof fileStore.read !== 'function') {
    throw new Error(
      'createInventoryRepository requires fileStore.read()'
    );
  }

  if (!fileStore || typeof fileStore.update !== 'function') {
    throw new Error(
      'createInventoryRepository requires fileStore.update()'
    );
  }

  if (!filePath) {
    throw new Error(
      'createInventoryRepository requires filePath'
    );
  }

  async function getSnapshot({ fresh = false } = {}) {
    const canUseCache =
      !fresh &&
      state &&
      state.inventoryCache &&
      state.inventoryCacheUpdatedAt;

    if (canUseCache) {
      return cloneJson(state.inventoryCache);
    }

    const snapshot = await fileStore.read(filePath);

    validateInventorySchema(snapshot);
    updateCache(snapshot);

    return cloneJson(snapshot);
  }

  async function getItemByKey(itemKey, { fresh = false } = {}) {
    validateItemKey(itemKey);

    const snapshot = await getSnapshot({ fresh });
    const item = snapshot.Items[itemKey];

    if (!item) {
      return null;
    }

    return toItemResult(itemKey, item);
  }

  async function listItems({ fresh = false } = {}) {
    const snapshot = await getSnapshot({ fresh });

    return Object.keys(snapshot.Items).map((itemKey) => {
      return toItemResult(itemKey, snapshot.Items[itemKey]);
    });
  }

  async function getRecentAudits({ limit = 10, fresh = false } = {}) {
    const snapshot = await getSnapshot({ fresh });
    const normalizedLimit = normalizeLimit(limit, 10);

    return cloneJson(
      snapshot.RecentAudits
        .slice(-normalizedLimit)
        .reverse()
    );
  }

  async function hasProcessedEvent(eventId, { fresh = false } = {}) {
    const normalizedEventId = normalizeOptionalEventId(eventId);

    if (!normalizedEventId) {
      return false;
    }

    const snapshot = await getSnapshot({ fresh });

    return snapshot.ProcessedEvents.includes(normalizedEventId);
  }

  /**
   * เพิ่มหรือลดสต็อกตาม deltaKg
   *
   * ตัวอย่าง:
   * - รับเข้า 100 กก. => deltaKg: 100
   * - ตัดออก 25 กก. => deltaKg: -25
   */
  async function applyStockChange({
    itemKey,
    deltaKg,
    action = 'ADJUST',
    reason,
    note,
    source,
    reference,
    actor,
    eventId
  }) {
    validateItemKey(itemKey);
    validateFiniteNumber(deltaKg, 'deltaKg');

    const normalizedDeltaKg = roundKg(deltaKg);
    const normalizedAction = String(action || 'ADJUST')
      .trim()
      .toUpperCase();
    const normalizedEventId = normalizeOptionalEventId(eventId);

    if (normalizedDeltaKg === 0) {
      throw createValidationError('deltaKg must not be 0');
    }

    let transactionResult = null;

    const updatedSnapshot = await fileStore.update(
      filePath,
      async (snapshot) => {
        validateInventorySchema(snapshot);

        const item = snapshot.Items[itemKey];

        if (!item) {
          throw createNotFoundError(
            `Inventory item not found: ${itemKey}`
          );
        }

        /*
         * Idempotency:
         * หาก integration/webhook ส่ง event เดิมซ้ำ จะไม่ปรับสต็อกซ้ำ
         */
        if (
          normalizedEventId &&
          snapshot.ProcessedEvents.includes(normalizedEventId)
        ) {
          transactionResult = {
            duplicate: true,
            itemKey,
            previousStockKg: readStockKg(item, itemKey),
            newStockKg: readStockKg(item, itemKey)
          };

          return snapshot;
        }

        const previousStockKg = readStockKg(item, itemKey);
        const newStockKg = roundKg(
          previousStockKg + normalizedDeltaKg
        );

        if (newStockKg < 0) {
          throw createValidationError(
            `Insufficient stock for ${itemKey}: ` +
            `current=${previousStockKg}, ` +
            `requested delta=${normalizedDeltaKg}`
          );
        }

        item.StockKg = newStockKg;

        appendAuditTrail(snapshot, {
          itemKey,
          item,
          previousStockKg,
          newStockKg,
          action: normalizedAction,
          reason,
          note,
          source,
          reference,
          actor,
          eventId: normalizedEventId
        });

        if (normalizedEventId) {
          snapshot.ProcessedEvents.push(normalizedEventId);
        }

        snapshot.LastUpdated = new Date().toISOString();

        transactionResult = {
          duplicate: false,
          itemKey,
          previousStockKg,
          newStockKg
        };

        return snapshot;
      }
    );

    if (!transactionResult) {
      throw new Error(
        'Inventory update completed without a transaction result'
      );
    }

    validateInventorySchema(updatedSnapshot);
    updateCache(updatedSnapshot);

    const updatedItem = updatedSnapshot.Items[itemKey];

    if (
      !transactionResult.duplicate &&
      logger &&
      typeof logger.info === 'function'
    ) {
      logger.info('[inventory-repository] stock updated', {
        itemKey,
        action: normalizedAction,
        deltaKg: normalizedDeltaKg,
        previousStockKg: transactionResult.previousStockKg,
        newStockKg: transactionResult.newStockKg,
        eventId: normalizedEventId || null
      });
    }

    return {
      duplicate: transactionResult.duplicate,
      itemKey,
      previousStockKg: transactionResult.previousStockKg,
      stockKg: transactionResult.newStockKg,
      item: cloneJson(updatedItem),
      snapshot: cloneJson(updatedSnapshot)
    };
  }

  /**
   * กำหนดยอดสต็อกใหม่โดยตรง
   * ใช้สำหรับผลตรวจนับหรือการปรับยอดโดยผู้มีสิทธิ์
   */
  async function setStock({
    itemKey,
    newStockKg,
    action = 'MANUAL_SET',
    reason,
    note,
    source,
    reference,
    actor,
    eventId
  }) {
    validateItemKey(itemKey);
    validateFiniteNumber(newStockKg, 'newStockKg');

    const normalizedNewStockKg = roundKg(newStockKg);
    const normalizedAction = String(action || 'MANUAL_SET')
      .trim()
      .toUpperCase();
    const normalizedEventId = normalizeOptionalEventId(eventId);

    if (normalizedNewStockKg < 0) {
      throw createValidationError(
        'newStockKg must not be negative'
      );
    }

    let transactionResult = null;

    const updatedSnapshot = await fileStore.update(
      filePath,
      async (snapshot) => {
        validateInventorySchema(snapshot);

        const item = snapshot.Items[itemKey];

        if (!item) {
          throw createNotFoundError(
            `Inventory item not found: ${itemKey}`
          );
        }

        if (
          normalizedEventId &&
          snapshot.ProcessedEvents.includes(normalizedEventId)
        ) {
          transactionResult = {
            duplicate: true,
            itemKey,
            previousStockKg: readStockKg(item, itemKey),
            newStockKg: readStockKg(item, itemKey)
          };

          return snapshot;
        }

        const previousStockKg = readStockKg(item, itemKey);

        item.StockKg = normalizedNewStockKg;

        appendAuditTrail(snapshot, {
          itemKey,
          item,
          previousStockKg,
          newStockKg: normalizedNewStockKg,
          action: normalizedAction,
          reason,
          note,
          source,
          reference,
          actor,
          eventId: normalizedEventId
        });

        if (normalizedEventId) {
          snapshot.ProcessedEvents.push(normalizedEventId);
        }

        snapshot.LastUpdated = new Date().toISOString();

        transactionResult = {
          duplicate: false,
          itemKey,
          previousStockKg,
          newStockKg: normalizedNewStockKg
        };

        return snapshot;
      }
    );

    if (!transactionResult) {
      throw new Error(
        'Inventory set operation completed without a transaction result'
      );
    }

    validateInventorySchema(updatedSnapshot);
    updateCache(updatedSnapshot);

    const updatedItem = updatedSnapshot.Items[itemKey];

    if (
      !transactionResult.duplicate &&
      logger &&
      typeof logger.info === 'function'
    ) {
      logger.info('[inventory-repository] stock set', {
        itemKey,
        action: normalizedAction,
        previousStockKg: transactionResult.previousStockKg,
        newStockKg: transactionResult.newStockKg,
        eventId: normalizedEventId || null
      });
    }

    return {
      duplicate: transactionResult.duplicate,
      itemKey,
      previousStockKg: transactionResult.previousStockKg,
      stockKg: transactionResult.newStockKg,
      item: cloneJson(updatedItem),
      snapshot: cloneJson(updatedSnapshot)
    };
  }

  function invalidateCache() {
    if (!state) {
      return;
    }

    state.inventoryCache = null;
    state.inventoryCacheUpdatedAt = 0;
  }

  function updateCache(snapshot) {
    if (!state) {
      return;
    }

    state.inventoryCache = cloneJson(snapshot);
    state.inventoryCacheUpdatedAt = Date.now();

    if (typeof fileStore.getPendingWriteCount === 'function') {
      state.inventoryWriteQueueDepth =
        fileStore.getPendingWriteCount();
    }
  }

  return {
    getSnapshot,
    getItemByKey,
    listItems,
    getRecentAudits,
    hasProcessedEvent,
    applyStockChange,
    setStock,
    invalidateCache
  };
}

/**
 * รักษา compatibility กับ AuditTrail ที่มีอยู่เดิม:
 * - Timestamp, Source
 * - Item / Details
 * - ItemKey, ItemName, PreviousKg, NewKg, MessageDate
 * - Field, PreviousValue, NewValue, Unit, EventId
 */
function appendAuditTrail(snapshot, {
  itemKey,
  item,
  previousStockKg,
  newStockKg,
  action,
  reason,
  note,
  source,
  reference,
  actor,
  eventId
}) {
  const timestamp = new Date().toISOString();
  const itemName = item.Name || itemKey;
  const normalizedSource = source || 'UNKNOWN';

  const detailParts = [
    `Action=${action || 'ADJUST'}`,
    `StockKg: ${previousStockKg} -> ${newStockKg}`
  ];

  if (reason) {
    detailParts.push(`Reason=${reason}`);
  }

  if (reference) {
    detailParts.push(`Reference=${reference}`);
  }

  snapshot.AuditTrail.push({
    Timestamp: timestamp,
    Source: normalizedSource,

    // รองรับรูปแบบ AuditTrail เดิม
    Item: itemName,
    Details: detailParts.join(' | '),

    // รองรับ direct stock update
    ItemKey: itemKey,
    ItemName: itemName,
    PreviousKg: previousStockKg,
    NewKg: newStockKg,
    MessageDate: timestamp,

    // รองรับ field-level update
    Field: 'StockKg',
    PreviousValue: previousStockKg,
    NewValue: newStockKg,
    Unit: 'kg',
    EventId: eventId || null,

    // Metadata สำหรับ migration และ trace transaction
    Action: action || 'ADJUST',
    Reason: reason || null,
    Note: note || null,
    Reference: reference || null,
    Actor: actor || null
  });
}

function toItemResult(itemKey, item) {
  return {
    itemKey,
    item: cloneJson(item),
    stockKg: readStockKg(item, itemKey)
  };
}

function validateInventorySchema(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error(
      'Invalid stock_inventory.json: root must be an object'
    );
  }

  if (
    !snapshot.Items ||
    typeof snapshot.Items !== 'object' ||
    Array.isArray(snapshot.Items)
  ) {
    throw new Error(
      'Invalid stock_inventory.json: root.Items must be an object'
    );
  }

  /*
   * หากไฟล์เก่าขาด array บางตัว ให้เติมเฉพาะ structure ที่จำเป็น
   * โดยจะถูกบันทึกจริงเมื่อเกิด write operation ครั้งต่อไป
   */
  if (!Array.isArray(snapshot.AuditTrail)) {
    snapshot.AuditTrail = [];
  }

  if (!Array.isArray(snapshot.ProcessedEvents)) {
    snapshot.ProcessedEvents = [];
  }

  if (!Array.isArray(snapshot.RecentAudits)) {
    snapshot.RecentAudits = [];
  }
}

function readStockKg(item, itemKey) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw createValidationError(
      `Invalid inventory item: ${itemKey}`
    );
  }

  const stockKg = Number(item.StockKg);

  if (!Number.isFinite(stockKg)) {
    throw createValidationError(
      `Inventory stock is not a valid number: ` +
      `${itemKey}.StockKg`
    );
  }

  return stockKg;
}

function validateItemKey(itemKey) {
  if (!itemKey || typeof itemKey !== 'string' || !itemKey.trim()) {
    throw createValidationError('itemKey is required');
  }
}

function validateFiniteNumber(value, fieldName) {
  if (!Number.isFinite(Number(value))) {
    throw createValidationError(
      `${fieldName} must be a finite number`
    );
  }
}

function normalizeOptionalEventId(eventId) {
  if (eventId === null || eventId === undefined) {
    return null;
  }

  const normalized = String(eventId).trim();

  return normalized || null;
}

function normalizeLimit(value, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }

  return Math.floor(number);
}

function roundKg(value) {
  return Math.round(
    (Number(value) + Number.EPSILON) * 1000
  ) / 1000;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createValidationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  error.statusCode = 400;
  return error;
}

function createNotFoundError(message) {
  const error = new Error(message);
  error.code = 'NOT_FOUND';
  error.statusCode = 404;
  return error;
}

module.exports = {
  createInventoryRepository
};