# PSCDB Repository Structure

## Runtime and deployment

`webhook_server.js` is the local/bot-facing runtime. `render-dashboard/server.js` is the production Render runtime. They are currently separate entry points and must not be synchronized automatically. Render serves the dashboard from `render-dashboard/public/ops.html`.

The dashboard has a mirrored source copy at `public/ops.html`. Keep both dashboard copies synchronized when changing the UI. The WDB/Google Sheets service is the preferred live data source through `/api/live-sheets`; the JSON files remain local/runtime fallbacks for existing bot and server workflows.

## Source directories

| Path | Purpose |
|---|---|
| `config/`, `core/` | Shared runtime configuration and application context |
| `config/data-sources.js` | Canonical Drive folder and underlying workbook IDs used by both Node runtimes |
| `repositories/`, `services/` | Inventory and operational service modules |
| `scripts/` | CLI tools and deterministic record-processing utilities |
| `public/` | Local dashboard source assets |
| `render-dashboard/` | Render deployment copy and server |
| `tests/` | Security and live HTTP tests |
| `docs/` | Maintained documentation only |
| `data/examples/` | Sanitized example payloads |

`scripts/validate-deployment.js` is the deterministic release guard. It verifies that the root and Render server entrypoints remain separate, the sync scripts cannot overwrite runtime files, Render contains no LINE reply endpoint, and the shared forecast-rule exports are present.

The five operational workbooks are organized in the canonical Drive folder recorded in `config/data-sources.js`. The folder contains `.gsheet` shortcut files, so runtime code uses each shortcut's underlying spreadsheet ID rather than the shortcut file ID.

## Data policy

Google Sheets/WDB is the system of record for live stock, schedules, prices, and customer plans. Do not commit downloaded Drive exports, customer files, PO images, operational backups, or generated audit snapshots. Use `.example` files for schemas and sanitized test data.

Operational JSON files that are still present are compatibility fallbacks used by the existing local and Render runtimes. They should not be treated as the primary source for the dashboard.

## Removed from the repository

Legacy patch scripts, binary stock workbooks, captured PO images, dated backups, generated source dumps, temporary reports, and obsolete Apps Script snapshots were removed from the deploy repository. Historical recovery belongs in Git history or private storage, not in the runtime tree.

## Deployment checklist

1. Update the correct runtime. Do not copy `webhook_server.js` over `render-dashboard/server.js`; they currently have different route ownership.
2. Run `npm run check`, `npm test`, and `npm run test:duplicates` from the repository root. The Render package exposes the same checks through `cd render-dashboard && npm run check && npm test`.
3. Confirm `render-dashboard/public/ops.html` contains the current dashboard adapter.
4. Use `sync_render_dashboard.sh` only for the explicitly listed shared assets. It checks for drift and requires `--apply` for a copy operation.
5. Run `git diff --check`. The optional `npm run test:integration` command runs the live HTTP audit and may mutate local runtime state; it is not part of the default test command.
6. Commit and push to `main`; Render deploys from that branch.
