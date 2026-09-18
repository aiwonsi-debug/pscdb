# PSCDB Handover Documentation

**Project:** PSCDB field operations dashboard  
**Repository:** `aiwonsi-debug/pscdb`  
**Live dashboard:** https://pscdb.onrender.com/ops  
**Primary service:** Render service `pscdb.onrender.com`  
**Last updated:** 2026-09-18

## Executive status

The dashboard is deployed and reads live stock, schedule, price, transport, and Customer PO forecast data from the PSC WDB Apps Script endpoint. The price view uses a light theme and groups transport costs by named transporter, vehicle type, price, and location. The current display hides unnamed transport groups so that duplicate rows from the source sheet do not confuse users.

The dashboard loader now retries the WDB endpoint up to three times and renders each dashboard section independently. A temporary failure in Team Status or an empty WDB response therefore does not blank the entire page.

The LINE bot parser now recognizes receiving reports that use wording such as `รับกะหล่ำปลี`, `สุ่มปอก`, and `ปอกได้`. For the reported example, it extracts 7,425 kg, a 100 kg sample, 74.93 kg peeled, and a 74.93% yield. The bot routing fix forces these receiving reports into the intake workflow instead of the shipment workflow.

The Apps Script routing patch is deployed to the active PSC WDB web app as version 35. It classifies receiving reports as `intake`, avoids writing them to `Next Schedule & Other Tasks`, and resolves the live destination tab as `Dispatch & Intake Log` with compatibility fallbacks for `Dispatch & Intake` and `LINE Intake Inbox`.

## Runtime architecture

The public dashboard is served by the Render runtime from `render-dashboard/public/ops.html`. The active server is `render-dashboard/server.js`. The dashboard requests `/api/live-sheets` for WDB data and `/api/team-status` for operational status and intake history.

The WDB endpoint is the deployed Google Apps Script web app configured through `GAS_WEBHOOK_URL`. The summary response is expected to contain `stock`, `schedules`, `prices`, `demandByDate`, and `demandSource`. The current live response was verified with 25 price rows, four stock rows, and Customer PO demand dates.

The LINE webhook enters the application through `/api/line-webhook`. Text messages are routed to `bot.js`, which uses `services/stock_parser.js` for deterministic receiving and stock extraction. The bot also uses an AI parser for broader operations messages. Receiving keywords are now given priority over AI shipment classification.

## Data destinations

| Data type | Source or writer | Intended destination |
|---|---|---|
| Live stock | WDB Apps Script summary | Dashboard Stock tab |
| Live schedules | WDB Apps Script summary | Dashboard Pending tab |
| Price and transport rows | WDB Apps Script summary | Dashboard Price tab |
| Customer PO demand | WDB Apps Script summary | Dashboard Stock forecast chart |
| LINE receiving reports | Apps Script direct-event handler | Dispatch & Intake Log destination |
| Shipment or loading plans | Apps Script direct-event handler | Next Schedule & Other Tasks |
| Local operational intake history | `webhook_server.js` and `team_ops_status.json` | Dashboard History / intake data |

The critical distinction is that a receiving report is not a future schedule. A receiving report must not create a schedule row. It should create an intake row with `reportType: intake` and be written to the Dispatch & Intake destination.

## Receiving message contract

The following message is supported by the deterministic parser:

```text
18/9/26 รับกะหล่ำปลีเฮียหนิง
จำนวน 7,425 กก.
ขนาดกลาง-ใหญ่
สภาพโดยรวมสวย
สุ่มปอก 100 กก.
ปอกได้ 74.93 กก.
```

The expected normalized record is:

```json
{
  "reportType": "intake",
  "date": "18/9/26",
  "supplier": "เฮียหนิง",
  "item": "กะหล่ำปลี",
  "weight_kg": 7425,
  "size": "กลาง-ใหญ่",
  "condition": "สวย",
  "sample_kg": 100,
  "peeled_kg": 74.93,
  "yield_pct": 74.93
}
```

The value `yield_pct` is calculated from the source quantities as `(peeled_kg / sample_kg) × 100`. No forecast or operational number is hard-coded into this parser.

## Recent repository changes

The recent commits are:

| Commit | Purpose |
|---|---|
| `7519237` | Added support for Thai receiving reports with sample-peeling yield data. |
| `b3e326c` | Routed receiving wording away from the shipment workflow and added size and condition extraction. |
| `6e6e794` | Added WDB retries and independent dashboard rendering. |
| `17cb229` | Hid unnamed transport groups from the summary view. |
| `ec4d734` | Normalized transporter owner grouping. |
| `3c7401e` | Grouped transport rows by owner, route, vehicle type, and price. |

The Apps Script source in `integrations/google-apps-script/psc_wdb_web_app.gs` adds receiving classification, sends `scheduleRow: null`, and writes the intake row to `Dispatch & Intake Log`. The deployed web app is version 35.

## Post-deployment verification

The active Apps Script project used by PSCDB is the PSC WDB Apps Script project. Version 35 is deployed and the web-app endpoint returned HTTP 200 with live JSON after propagation. Send one receiving report and verify all of the following:

1. The LINE reply says `บันทึกรับเข้า/รับของ PSC เรียบร้อย`.
2. No new row appears in `Next Schedule & Other Tasks`.
3. A new row appears in the `Dispatch & Intake Log` destination.
4. The row contains the item, supplier, quantity, sample weight, peeled weight, and yield.
5. The dashboard intake/history endpoint shows the new receiving record.

The remaining verification step is an end-to-end LINE message test. The repository and live deployment are now aligned with the actual spreadsheet tab name.

## Verification commands

Run the following checks after deployment:

```bash
curl -sS https://pscdb.onrender.com/api/health
curl -sS https://pscdb.onrender.com/api/live-sheets
curl -sS https://pscdb.onrender.com/api/team-status
```

The health response should report `status: ONLINE` and `gasSynced: true`. The live-sheets response should include non-empty `stock`, `prices`, and `demandByDate` data when the WDB is available.

For local parser verification:

```bash
node --check services/stock_parser.js
node --check bot.js
node /tmp/test_intake_parser.js
```

## Operational cautions

The WDB is the source of truth for dashboard numbers. Do not add fallback forecast dates, stock quantities, prices, transport costs, supplier names, or PO quantities to the frontend. The frontend may retry or display an unavailable-data state, but it must not invent operational values.

The dashboard contains two HTML copies because the Render deployment path and the repository’s public path are both maintained. When changing dashboard behavior, keep `public/ops.html` and `render-dashboard/public/ops.html` identical and validate them with `cmp`.

Do not remove the Apps Script source from the repository. It is the maintained integration reference and is required for future handovers. Credentials and access tokens must remain in environment variables or Apps Script properties and must not be committed.

## References

[1]: https://pscdb.onrender.com/ops "PSCDB live field operations dashboard"

[2]: https://github.com/aiwonsi-debug/pscdb "PSCDB GitHub repository"

[3]: https://script.google.com/home "Google Apps Script home"
