'use strict';

const path = require('path');

const baseDir = process.env.AGY_BASE_DIR || path.resolve(__dirname, '..');

module.exports = {
  baseDir,
  stockInventory: path.join(baseDir, 'stock_inventory.json'),
  teamOpsStatus: path.join(baseDir, 'team_ops_status.json'),
  secretsDir: path.join(baseDir, 'secrets'),
  logFile: path.join(baseDir, 'secretary_activity.log'),
  backupDir: path.join(baseDir, 'backups', 'stock')
};
