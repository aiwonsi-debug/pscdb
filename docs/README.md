# PSC Lean Record Kit

A small, dependency-light replacement for asking Antigravity CLI (agy) to
reason through inventory/PO tasks in natural language. Same 4 tasks that
used to burn a full 5-hour Google Pro token quota now run as direct,
zero-or-low-token commands.

## Setup

```
cd scripts
npm install
```

(Only installs `pdf-parse` — everything else is plain Node, no LLM calls.)

Your live `stock_inventory.json` was copied in as a starting point. Point
`STOCK_PATH` in `record_cli.js` at your real file if you'd rather edit it
in place instead of this copy.

## Commands

```
node record_cli.js load     <ItemKey> <Kg> [note]     # subtract stock (outgoing)
node record_cli.js receive  <ItemKey> <Kg> [note]     # add stock (incoming)
node record_cli.js update   <ItemKey> <NewKg> [note]  # set absolute stock count
node record_cli.js show     [ItemKey]                 # print current stock
node record_cli.js po       <file.xlsx|file.pdf>      # ingest a PO
```

Examples:

```
node record_cli.js load Cabbage 500 "Loaded for TNS delivery"
node record_cli.js receive Cabbage 1200 "Received from farm truck"
node record_cli.js update Onion_AFT 19140 "Manual stock count"
node record_cli.js po ./incoming/TNS_Order_Sep.xlsx
```

- Refuses any update that would push stock negative.
- Every change is written through `business_logic.js`'s existing
  `applyStockUpdate`, so it lands in `AuditTrail` exactly the way your
  current system expects.
- `.xlsx` POs go through the existing pure-JS `tns_order_parser.js` —
  no LLM tokens spent at all.
- `.pdf` POs try text extraction first (cheap). Only fall back to
  rendering pages as images for vision if the PDF has no text layer
  (i.e. it's a scan) — vision tokens are the most expensive part of
  the old workflow, so this alone should cut PDF-PO cost the most.

## How to use this with Antigravity CLI

Instead of one combined prompt like:

> "add 3 records about loading cabbage, received cabbage, update
> inventory stock, add new PO from pdf and excel"

send agy 4 short instructions, each pointing at a script call:

> "Run `node record_cli.js load Cabbage 500` in the scripts folder."
> "Run `node record_cli.js receive Cabbage 1200`."
> "Run `node record_cli.js update Onion_AFT 19140`."
> "Run `node record_cli.js po ./incoming/order.xlsx`."

This keeps the agent from re-deriving how your stock system works each
session, and stops it from reading `bot.js`, `webhook_server.js`, or
`ALL_SOURCE_CODE_FOR_AUDIT.txt` just to add a number.

## .agentsignore

Also included at the project root: a list of folders/files (node_modules,
extracted_po_images, logs, the audit dump, backups) that should be
excluded from whatever context-loading config your agy setup uses. Check
`~/.gemini/settings.json` for an ignore/exclude key, or an equivalent file
agy reads directly, and apply the same pattern list there.
