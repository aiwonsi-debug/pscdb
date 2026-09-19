'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rootServer = fs.readFileSync(path.join(root, 'webhook_server.js'), 'utf8');
const renderServer = fs.readFileSync(path.join(root, 'render-dashboard', 'server.js'), 'utf8');
const syncShell = fs.readFileSync(path.join(root, 'sync_render_dashboard.sh'), 'utf8');
const syncPowerShell = fs.readFileSync(path.join(root, 'sync_render_dashboard.ps1'), 'utf8');

function fail(message) {
    console.error(`Deployment validation failed: ${message}`);
    process.exitCode = 1;
}

function assertCondition(condition, message) {
    if (!condition) fail(message);
}

// Root and Render are intentionally separate applications. The release guard may
// synchronize shared assets, but it must never overwrite either runtime entrypoint.
assertCondition(rootServer !== renderServer, 'root and Render server entrypoints must remain explicitly separate');
assertCondition(!syncShell.includes('webhook_server.js') && !syncShell.includes('server.js'), 'shell sync guard must not copy runtime server files');
assertCondition(!syncPowerShell.includes('webhook_server.js') && !syncPowerShell.includes('server.js'), 'PowerShell sync guard must not copy runtime server files');

// Apps Script owns the LINE replyToken in production. Render may forward events,
// but it must not contain an active LINE reply implementation.
assertCondition(!renderServer.includes('/v2/bot/message/reply'), 'Render must not call the LINE reply endpoint');
assertCondition(!renderServer.includes('replyReceivingEventDirectly'), 'Render must not activate a direct receiving-event reply path');
assertCondition(renderServer.includes('syncToGoogleSheets(payload)'), 'Render must forward LINE events to Apps Script');
assertCondition(renderServer.includes('Apps Script is the only component allowed'), 'Render must document the reply-owner boundary');

// The pure business-rule module must remain present and loadable by both runtimes.
const forecastRules = require(path.join(root, 'shared', 'forecast-rules.js'));
for (const name of ['normalizeYieldRate', 'rawVolumeFromFinishedVolume', 'forecastBalance', 'poDeduplicationKey', 'deduplicatePoRows']) {
    assertCondition(typeof forecastRules[name] === 'function', `forecast rule export missing: ${name}`);
}

if (process.exitCode) process.exit();
console.log('Deployment validation: runtime boundaries, LINE reply ownership, and forecast exports are valid');
