# PSCDB Repository Structure

## Runtime and deployment

`webhook_server.js` is the local/bot-facing runtime. `render-dashboard/server.js` is the Render runtime. Render serves the dashboard from `render-dashboard/public/ops.html`.

The dashboard has a mirrored source copy at `public/ops.html`. Keep both dashboard copies synchronized when changing the UI. The WDB/Google Sheets service is the preferred live data source through `/api/live-sheets`; the JSON files remain local/runtime fallbacks for existing bot and server workflows.

## Source directories

| Path | Purpose |
|---|---|
| `config/`, `core/` | Shared runtime configuration and application context |
| `repositories/`, `services/` | Inventory and operational service modules |
| `scripts/` | CLI tools and deterministic record-processing utilities |
| `public/` | Local dashboard source assets |
| `render-dashboard/` | Render deployment copy and server |
| `tests/` | Security and live HTTP tests |
| `docs/` | Maintained documentation only |
| `data/examples/` | Sanitized example payloads |

## Data policy

Google Sheets/WDB is the system of record for live stock, schedules, prices, and customer plans. Do not commit downloaded Drive exports, customer files, PO images, operational backups, or generated audit snapshots. Use `.example` files for schemas and sanitized test data.

Operational JSON files that are still present are compatibility fallbacks used by the existing local and Render runtimes. They should not be treated as the primary source for the dashboard.

## Removed from the repository

Legacy patch scripts, binary stock workbooks, captured PO images, dated backups, generated source dumps, temporary reports, and obsolete Apps Script snapshots were removed from the deploy repository. Historical recovery belongs in Git history or private storage, not in the runtime tree.

## Deployment checklist

1. Update the canonical source and its Render mirror where applicable.
2. Run `git diff --check` and the relevant tests.
3. Confirm `render-dashboard/public/ops.html` contains the current dashboard adapter.
4. Commit and push to `main`; Render deploys from that branch.
