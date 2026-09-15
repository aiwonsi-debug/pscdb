'use strict';

/**
 * Adapter à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡ scripts/record_cli.js à¹€à¸”à¸´à¸¡à¸à¸±à¸š inventory-service.js
 *
 * à¸«à¸¥à¸±à¸à¸à¸²à¸£:
 * - record_cli.js à¸„à¸‡à¸à¸²à¸£ parse argv à¹à¸¥à¸° syntax à¹€à¸”à¸´à¸¡à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”
 * - adapter à¸£à¸±à¸š normalized record à¸ˆà¸²à¸ CLI à¹€à¸”à¸´à¸¡
 * - à¸—à¸¸à¸à¸à¸²à¸£à¹€à¸‚à¸µà¸¢à¸™ stock_inventory.json à¸œà¹ˆà¸²à¸™ inventory-service à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™
 *
 * à¸£à¸¹à¸›à¹à¸šà¸š normalized record:
 * {
 *   action: 'RECEIVE' | 'LOAD' | 'ADJUST' | 'MANUAL_SET',
 *   itemKey: 'Cabbage',
 *   quantityKg: 25,       // à¸ªà¸³à¸«à¸£à¸±à¸š RECEIVE / LOAD
 *   deltaKg: -2.5,        // à¸ªà¸³à¸«à¸£à¸±à¸š ADJUST
 *   newStockKg: 100,      // à¸ªà¸³à¸«à¸£à¸±à¸š MANUAL_SET
 *   reason: '...',
 *   note: '...',
 *   reference: '...',
 *   actor: '...'
 * }
 */

const crypto = require('crypto');

function createInventoryCliAdapter({
  inventoryService,
  logger = console,
  defaultActor = 'record_cli',
  defaultSource = 'CLI'
}) {
  if (!inventoryService) {
    throw new Error(
      'createInventoryCliAdapter requires inventoryService'
    );
  }

  async function applyLegacyRecord(record) {
    validateRecord(record);

    const action = normalizeAction(record.action);
    const common = {
      itemKey: String(record.itemKey).trim(),
      reason: normalizeOptionalText(record.reason) || action,
      note: normalizeOptionalText(record.note),
      source: normalizeOptionalText(record.source) || defaultSource,
      reference: normalizeOptionalText(record.reference),
      actor: normalizeOptionalText(record.actor) || defaultActor,

      /*
       * CLI à¸›à¸à¸•à¸´à¹€à¸›à¹‡à¸™à¸à¸²à¸£à¸à¸”à¸—à¸³à¸‡à¸²à¸™à¸„à¸£à¸±à¹‰à¸‡à¹€à¸”à¸µà¸¢à¸§ à¸ˆà¸¶à¸‡à¸ªà¸£à¹‰à¸²à¸‡ eventId à¹ƒà¸«à¸¡à¹ˆà¸•à¹ˆà¸­ invocation
       * à¸«à¸²à¸ CLI à¹€à¸”à¸´à¸¡à¸¡à¸µ transaction ID/à¹ƒà¸šà¸£à¸±à¸šà¸ªà¸´à¸™à¸„à¹‰à¸²/à¹€à¸¥à¸‚à¹€à¸­à¸à¸ªà¸²à¸£ à¹ƒà¸«à¹‰à¸ªà¹ˆà¸‡à¹€à¸›à¹‡à¸™
       * record.eventId à¹€à¸žà¸·à¹ˆà¸­à¸£à¸­à¸‡à¸£à¸±à¸š retry à¹à¸šà¸š idempotent à¹„à¸”à¹‰à¸ˆà¸£à¸´à¸‡
       */
      eventId: normalizeOptionalText(record.eventId) ||
        createCliEventId(record, action)
    };

    let result;

    switch (action) {
      case 'RECEIVE':
        result = await inventoryService.receiveStock({
          ...common,
          quantityKg: record.quantityKg
        });
        break;

      case 'LOAD':
        result = await inventoryService.loadStock({
          ...common,
          quantityKg: record.quantityKg
        });
        break;

      case 'ADJUST':
        result = await inventoryService.adjustStock({
          ...common,
          deltaKg: record.deltaKg
        });
        break;

      case 'MANUAL_SET':
        result = await inventoryService.manuallySetStock({
          ...common,
          newStockKg: record.newStockKg
        });
        break;

      default:
        throw new Error(`Unsupported inventory action: ${action}`);
    }

    if (logger && typeof logger.info === 'function') {
      logger.info('[record-cli] inventory transaction completed', {
        action,
        itemKey: common.itemKey,
        stockKg: result.stockKg,
        duplicate: result.duplicate === true,
        reference: common.reference || null
      });
    }

    return {
      action,
      itemKey: common.itemKey,
      duplicate: result.duplicate === true,
      previousStockKg: result.previousStockKg,
      stockKg: result.stockKg,
      item: result.item,
      snapshot: result.snapshot
    };
  }

  async function getStock(itemKey) {
    return inventoryService.getItem(itemKey, { fresh: true });
  }

  async function listStock() {
    return inventoryService.getInventory({ fresh: true });
  }

  return {
    applyLegacyRecord,
    getStock,
    listStock
  };
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('record must be an object');
  }

  if (!record.action || !String(record.action).trim()) {
    throw new Error('record.action is required');
  }

  if (!record.itemKey || !String(record.itemKey).trim()) {
    throw new Error('record.itemKey is required');
  }
}

function normalizeAction(value) {
  const action = String(value).trim().toUpperCase();

  /*
   * Alias à¹€à¸«à¸¥à¹ˆà¸²à¸™à¸µà¹‰à¸¡à¸µà¹„à¸§à¹‰à¸£à¸­à¸‡à¸£à¸±à¸šà¸Šà¸·à¹ˆà¸­ internal action à¸—à¸µà¹ˆà¸­à¸²à¸ˆà¸¡à¸µà¹ƒà¸™ CLI à¹€à¸”à¸´à¸¡
   * à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ syntax à¸—à¸µà¹ˆà¸œà¸¹à¹‰à¹ƒà¸Šà¹‰à¸žà¸´à¸¡à¸žà¹Œ à¹€à¸žà¸£à¸²à¸° parser à¹€à¸”à¸´à¸¡à¸¢à¸±à¸‡à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ record_cli.js
   */
  const aliases = {
    IN: 'RECEIVE',
    ADD: 'RECEIVE',
    RECEIVE: 'RECEIVE',
    OUT: 'LOAD',
    REMOVE: 'LOAD',
    DEDUCT: 'LOAD',
    LOAD: 'LOAD',
    ADJUST: 'ADJUST',
    SET: 'MANUAL_SET',
    MANUAL_SET: 'MANUAL_SET'
  };

  return aliases[action] || action;
}

function normalizeOptionalText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function createCliEventId(record, action) {
  const randomId = crypto.randomBytes(8).toString('hex');

  return [
    'cli',
    action.toLowerCase(),
    String(record.itemKey).trim(),
    Date.now(),
    process.pid,
    randomId
  ].join(':');
}

module.exports = {
  createInventoryCliAdapter
};