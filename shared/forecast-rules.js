'use strict';

/**
 * Pure Forecast rules shared by tests and server-side adapters.
 * Source PO sheets remain unchanged; conversion happens on normalized data.
 */

function normalizeYieldRate(value, fallback = 1) {
  const n = Number(String(value ?? '').replace('%', '').trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n > 1 ? n / 100 : n;
}

function rawVolumeFromFinishedVolume(finishedKg, yieldValue) {
  const finished = Number(finishedKg);
  const rate = normalizeYieldRate(yieldValue, 1);
  if (!Number.isFinite(finished) || finished < 0) return 0;
  return finished / rate;
}

function forecastBalance(openingStockKg, intakeKg, demandKg) {
  const opening = Number(openingStockKg) || 0;
  const intake = Number(intakeKg) || 0;
  const demand = Number(demandKg) || 0;
  return opening + intake - demand;
}

function poDeduplicationKey(row) {
  const po = String(row.poNumber ?? row.po ?? '').trim().toUpperCase();
  const date = String(row.deliveryDate ?? row.date ?? '').trim().slice(0, 10);
  const item = String(row.itemCode ?? row.item ?? '').trim().toUpperCase();
  return [po, date, item].join('|');
}

function deduplicatePoRows(rows) {
  const seen = new Set();
  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = poDeduplicationKey(row);
    if (!key.replace(/\|/g, '')) {
      result.push(row);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

module.exports = {
  normalizeYieldRate,
  rawVolumeFromFinishedVolume,
  forecastBalance,
  poDeduplicationKey,
  deduplicatePoRows
};
