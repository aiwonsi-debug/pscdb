'use strict';

function createInventoryService({
  inventoryRepository,
  events,
  logger
}) {
  if (!inventoryRepository) {
    throw new Error('createInventoryService requires inventoryRepository');
  }

  async function getInventory({ fresh = false } = {}) {
    const items = await inventoryRepository.listItems({ fresh });

    return {
      generatedAt: new Date().toISOString(),
      items,
      totalStockKg: roundKg(
        items.reduce((total, item) => total + item.stockKg, 0)
      )
    };
  }

  async function getItem(itemKey, { fresh = false } = {}) {
    const result = await inventoryRepository.getItemByKey(itemKey, { fresh });

    if (!result) {
      throw createNotFoundError(`Inventory item not found: ${itemKey}`);
    }

    return result;
  }

  /**
   * รับสินค้าเข้า: delta เป็นบวกเสมอ
   */
  async function receiveStock({
    itemKey,
    quantityKg,
    reason,
    note,
    source = 'UNKNOWN',
    reference,
    actor,
    eventId
  }) {
    const normalizedQuantityKg = requirePositiveKg(quantityKg, 'quantityKg');

    return commitChange({
      itemKey,
      deltaKg: normalizedQuantityKg,
      action: 'RECEIVE',
      reason,
      note,
      source,
      reference,
      actor,
      eventId
    });
  }

  /**
   * ตัดสินค้าออก: quantity เป็นบวก แต่ delta ที่บันทึกจะเป็นลบ
   */
  async function loadStock({
    itemKey,
    quantityKg,
    reason,
    note,
    source = 'UNKNOWN',
    reference,
    actor,
    eventId
  }) {
    const normalizedQuantityKg = requirePositiveKg(quantityKg, 'quantityKg');

    return commitChange({
      itemKey,
      deltaKg: -normalizedQuantityKg,
      action: 'LOAD',
      reason,
      note,
      source,
      reference,
      actor,
      eventId
    });
  }

  /**
   * ใช้กับกรณีตรวจนับจริงและต้องกำหนดยอดคงเหลือใหม่โดยตรง
   */
  async function manuallySetStock({
    itemKey,
    newStockKg,
    reason,
    note,
    source = 'MANUAL',
    reference,
    actor,
    eventId
  }) {
    const normalizedNewStockKg = requireNonNegativeKg(
      newStockKg,
      'newStockKg'
    );

    requireReason(reason, 'MANUAL_SET');

    const result = await inventoryRepository.setStock({
      itemKey,
      newStockKg: normalizedNewStockKg,
      action: 'MANUAL_SET',
      reason,
      note,
      source,
      reference,
      actor,
      eventId
    });

    emitInventoryUpdated({
      action: 'MANUAL_SET',
      itemKey,
      deltaKg: null,
      stockKg: result.stockKg,
      source,
      reference,
      actor
    });

    return result;
  }

  /**
   * Adjustment ใช้เมื่อต้องแก้ด้วยจำนวนเพิ่ม/ลดโดยมีเหตุผลชัดเจน
   */
  async function adjustStock({
    itemKey,
    deltaKg,
    reason,
    note,
    source = 'MANUAL',
    reference,
    actor,
    eventId
  }) {
    const normalizedDeltaKg = Number(deltaKg);

    if (!Number.isFinite(normalizedDeltaKg) || normalizedDeltaKg === 0) {
      throw createValidationError(
        'deltaKg must be a non-zero finite number'
      );
    }

    requireReason(reason, 'ADJUST');

    return commitChange({
      itemKey,
      deltaKg: normalizedDeltaKg,
      action: 'ADJUST',
      reason,
      note,
      source,
      reference,
      actor,
      eventId
    });
  }

  async function commitChange(change) {
    if (change.action === 'RECEIVE' || change.action === 'LOAD') {
      requireReason(change.reason, change.action);
    }

    const result = await inventoryRepository.applyStockChange(change);

    emitInventoryUpdated({
      action: change.action,
      itemKey: change.itemKey,
      deltaKg: change.deltaKg,
      stockKg: result.stockKg,
      source: change.source,
      reference: change.reference,
      actor: change.actor
    });

    if (logger && typeof logger.info === 'function') {
      logger.info('[inventory-service] transaction completed', {
        action: change.action,
        itemKey: change.itemKey,
        deltaKg: change.deltaKg,
        newStockKg: result.stockKg,
        reference: change.reference || null
      });
    }

    return result;
  }

  function emitInventoryUpdated(payload) {
    if (events && typeof events.emit === 'function') {
      events.emit('inventory.updated', {
        timestamp: new Date().toISOString(),
        ...payload
      });
    }
  }

  return {
    getInventory,
    getItem,
    receiveStock,
    loadStock,
    manuallySetStock,
    adjustStock
  };
}

function requirePositiveKg(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw createValidationError(`${fieldName} must be greater than 0`);
  }

  return roundKg(number);
}

function requireNonNegativeKg(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw createValidationError(`${fieldName} must be 0 or greater`);
  }

  return roundKg(number);
}

function requireReason(reason, action) {
  if (!reason || !String(reason).trim()) {
    throw createValidationError(
      `reason is required for inventory action: ${action}`
    );
  }
}

function roundKg(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
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
  createInventoryService
};
