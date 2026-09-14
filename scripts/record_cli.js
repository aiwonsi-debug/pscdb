#!/usr/bin/env node
"use strict";
/**
 * record_cli.js — deterministic, zero-LLM-token record entry for PSC cold storage.
 *
 * Purpose: replace natural-language chat requests like
 *   "add 3 records about loading cabbage, received cabbage, update inventory stock"
 * with direct commands the agent (or you) just executes — no reasoning, no
 * codebase reading, no context bloat.
 *
 * Usage:
 *   node record_cli.js load     <ItemKey> <Kg> [source]
 *   node record_cli.js receive  <ItemKey> <Kg> [source]
 *   node record_cli.js update   <ItemKey> <NewKg> [source]
 *   node record_cli.js po       <path-to-file.xlsx|.pdf>
 *   node record_cli.js show     [ItemKey]
 *
 * Examples:
 *   node record_cli.js load Cabbage 500 "Loaded for TNS delivery"
 *   node record_cli.js receive Cabbage 1200 "Received from farm truck"
 *   node record_cli.js update Onion_AFT 19140 "Manual stock count"
 *   node record_cli.js po ./incoming/TNS_Order_Sep.xlsx
 */

const fs = require("fs");
const path = require("path");
const { applyStockUpdate } = require("./business_logic.js");

const STOCK_PATH = path.join(__dirname, "..", "stock_inventory.json");

function loadStock() {
  return JSON.parse(fs.readFileSync(STOCK_PATH, "utf8"));
}

function saveStock(stock) {
  const content = JSON.stringify(stock, null, 2);
  fs.writeFileSync(STOCK_PATH, content, "utf8");

  // Sync copy to render-dashboard
  const renderPath = path.join(__dirname, "..", "render-dashboard", "stock_inventory.json");
  const agyMemoryPath = path.join(__dirname, "..", "agymemory", "stock_inventory.json");
  try { fs.writeFileSync(renderPath, content, "utf8"); } catch (e) {}
  try { fs.writeFileSync(agyMemoryPath, content, "utf8"); } catch (e) {}

  // Auto-sync to Render web server
  const syncScript = path.join(__dirname, "..", "sync_stock_to_render.js");
  if (fs.existsSync(syncScript)) {
    try {
      const { execSync } = require("child_process");
      execSync(`node "${syncScript}"`, { stdio: "ignore" });
    } catch (e) {}
  }
}

function currentKg(stock, itemKey) {
  if (!stock.Items[itemKey]) {
    throw new Error(
      `Unknown stock item "${itemKey}". Known items: ${Object.keys(stock.Items).join(", ")}`
    );
  }
  return Number(stock.Items[itemKey].StockKg || 0);
}

function makeEventId(action, itemKey) {
  return `${action}_${itemKey}_${Date.now()}`;
}

function doDeltaUpdate(action, itemKey, deltaKg, source) {
  const stock = loadStock();
  const before = currentKg(stock, itemKey);
  const signed = action === "load" ? -Math.abs(deltaKg) : Math.abs(deltaKg);
  const after = before + signed;

  if (after < 0) {
    throw new RangeError(
      `Refusing to update ${itemKey}: ${before}kg - ${Math.abs(deltaKg)}kg would go negative.`
    );
  }

  const result = applyStockUpdate(stock, {
    itemKey,
    newKg: after,
    source: source || `${action} entry via record_cli`,
    timestamp: new Date().toISOString(),
    eventId: makeEventId(action, itemKey)
  });

  saveStock(result.data);
  console.log(
    `${action.toUpperCase()} ${itemKey}: ${before}kg -> ${after}kg (${signed >= 0 ? "+" : ""}${signed}kg)`
  );
}

function doAbsoluteUpdate(itemKey, newKg, source) {
  const stock = loadStock();
  const before = currentKg(stock, itemKey);
  const result = applyStockUpdate(stock, {
    itemKey,
    newKg,
    source: source || "manual update via record_cli",
    timestamp: new Date().toISOString(),
    eventId: makeEventId("update", itemKey)
  });
  saveStock(result.data);
  console.log(`UPDATE ${itemKey}: ${before}kg -> ${newKg}kg`);
}

function doShow(itemKey) {
  const stock = loadStock();
  if (itemKey) {
    console.log(JSON.stringify({ [itemKey]: stock.Items[itemKey] }, null, 2));
  } else {
    const summary = {};
    for (const [k, v] of Object.entries(stock.Items)) summary[k] = v.StockKg;
    console.log(JSON.stringify(summary, null, 2));
  }
}

function doPO(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  const ext = path.extname(abs).toLowerCase();

  if (ext === ".xlsx") {
    // Zero-LLM-token path: pure-JS xlsx reader already in this codebase.
    const { extractTNSOrders } = require("./tns_order_parser.js");
    const orders = extractTNSOrders(abs);
    console.log(JSON.stringify(orders, null, 2));
    return;
  }

  if (ext === ".pdf") {
    // Try text extraction first (cheap). Only fall back to image/vision
    // if the PDF has no extractable text layer (i.e. it's scanned).
    let pdfParse;
    try {
      pdfParse = require("pdf-parse");
    } catch (e) {
      console.error(
        "pdf-parse is not installed. Run `npm install` in this folder first."
      );
      process.exit(1);
    }
    const buffer = fs.readFileSync(abs);
    pdfParse(buffer).then((data) => {
      const text = (data.text || "").trim();
      if (text.length > 20) {
        console.log("--- Extracted text (no vision tokens used) ---");
        console.log(text);
      } else {
        console.log(
          "No extractable text layer found — this PDF is likely scanned. " +
            "Fall back to the vision/image pipeline only for this file."
        );
      }
    });
    return;
  }

  console.error(`Unsupported PO file type: ${ext}. Use .xlsx or .pdf.`);
  process.exit(1);
}

function main() {
  const [, , cmd, a, b, ...rest] = process.argv;
  const source = rest.join(" ") || undefined;

  try {
    switch (cmd) {
      case "load":
        doDeltaUpdate("load", a, Number(b), source);
        break;
      case "receive":
        doDeltaUpdate("receive", a, Number(b), source);
        break;
      case "update":
        doAbsoluteUpdate(a, Number(b), source);
        break;
      case "po":
        doPO(a);
        break;
      case "show":
        doShow(a);
        break;
      default:
        console.log(
          "Usage: node record_cli.js <load|receive|update|po|show> ...\n" +
            "See the header comment in this file for examples."
        );
    }
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
