'use strict';

const { EventEmitter } = require('events');

const { createJsonFileStore } = require('../repositories/json-file-store');
const {
  createInventoryRepository
} = require('../repositories/inventory-repository');
const {
  createInventoryService
} = require('../services/inventory-service');

/**
 * สร้าง dependency และ shared state ระดับ application
 *
 * config ที่ต้องมีอย่างน้อย:
 * {
 *   paths: {
 *     stockInventory: 'c:\\agy\\stock_inventory.json'
 *   }
 * }
 *
 * logger ที่รองรับอย่างน้อย:
 * { info(), warn(), error(), debug() }
 */
function createAppContext({ config, logger }) {
  if (!config || !config.paths || !config.paths.stockInventory) {
    throw new Error(
      'createAppContext requires config.paths.stockInventory'
    );
  }

  const safeLogger = logger || console;

  const state = {
    startedAt: new Date(),
    inventoryCache: null,
    inventoryCacheUpdatedAt: 0,
    inventoryWriteQueueDepth: 0,
    runningJobs: new Map(),
    requestCounters: new Map()
  };

  const events = new EventEmitter();
  events.setMaxListeners(30);

  const fileStore = createJsonFileStore({
    logger: safeLogger
  });

  const inventoryRepository = createInventoryRepository({
    fileStore,
    filePath: config.paths.stockInventory,
    logger: safeLogger,
    state
  });

  const inventoryService = createInventoryService({
    inventoryRepository,
    events,
    logger: safeLogger
  });

  return {
    config,
    logger: safeLogger,
    state,
    events,

    repositories: {
      inventory: inventoryRepository
    },

    services: {
      inventory: inventoryService
    }
  };
}

module.exports = {
  createAppContext
};
