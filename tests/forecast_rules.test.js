'use strict';

const assert = require('assert');
const {
  normalizeYieldRate,
  rawVolumeFromFinishedVolume,
  forecastBalance,
  poDeduplicationKey,
  deduplicatePoRows
} = require('../shared/forecast-rules');

assert.strictEqual(normalizeYieldRate('67%'), 0.67);
assert.strictEqual(normalizeYieldRate(0.67), 0.67);
assert.strictEqual(rawVolumeFromFinishedVolume(50600, '67%'), 75522.3880597015);
assert.strictEqual(forecastBalance(10000, 2500, 4000), 8500);

const duplicate = {
  poNumber: 'PO6909-2505',
  deliveryDate: '2026-09-10',
  itemCode: 'Cabbage',
  quantityKg: 100
};
assert.strictEqual(poDeduplicationKey(duplicate), 'PO6909-2505|2026-09-10|CABBAGE');

const rows = deduplicatePoRows([
  duplicate,
  { ...duplicate, quantityKg: 100 },
  { ...duplicate, poNumber: 'PO6909-2506' }
]);
assert.strictEqual(rows.length, 2);

console.log('Forecast rules: 6 assertions passed');
