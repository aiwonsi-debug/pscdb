# PSC WDB / PSCDB Detailed Handover

**Prepared:** 19 September 2026  
**Repository:** `https://github.com/aiwonsi-debug/pscdb`  
**Production dashboard:** `https://pscdb.onrender.com/`  
**Primary deployment branch:** `main`  
**Audience:** New maintainer, operations lead, Apps Script administrator, and deployment reviewer

## 1. Purpose of this handover

This document describes the PSC operational data pipeline, the production boundaries, the spreadsheet contracts, the Forecast rules, the LINE processing rules, the deployment workflow, the testing workflow, and the recovery procedures.

The system receives reports and purchase-order images through LINE. Google Apps Script classifies and writes those reports to Google Sheets. The Render dashboard reads normalized data through the Apps Script summary endpoint and presents stock, intake, demand, schedules, prices, and Forecast information.

The most important operating principle is:

> **Google Sheets is the operational source of truth. Render is the presentation and gateway layer. Apps Script owns LINE event processing and user replies.**

The source PO sheets must not be modified merely to make Forecast calculations work. Calculations belong in the normalization and Forecast layer.

## 2. Current production architecture

```text
LINE user
   |
   | LINE webhook event
   v
Render production gateway
   |  /api/line-webhook
   |  verifies LINE signature when configured
   |  acknowledges LINE quickly
   |  forwards the event
   v
Google Apps Script web app: PSC WDB
   |  doPost(e)
   |  text event -> classification -> sheet write -> one LINE reply
   |  image event -> download -> Gemini Vision -> PO write -> one LINE reply
   |  duplicate protection by messageId/reportId
   v
Google Sheets
   |-- PSC WDB LINE Sync Database / LINE Reports
   |-- 1_Farm_Ops_Transport_and_Intake / Dispatch & Intake Log
   |-- 2_Material_Prices_and_Freight_Matrix
   |-- 3_Physical_Stock_and_Forecast / Clean_Stock
   |-- 4_Customer_POs_and_Delivery_Plans
   v
Apps Script doGet(action=summary)
   |
   v
Render /api/live-sheets
   |
   v
Dashboard: stock, intake, PO demand, schedules, prices, Forecast
```

### 2.1 Production ownership boundaries

The Render server is the production gateway. The root `webhook_server.js` is the local or bot-facing runtime. These two server entry points are currently separate and must not be copied over one another automatically.

The Render server does not reply to LINE events. It forwards the payload to Apps Script. Apps Script is the only production component that may consume the LINE `replyToken` and call the LINE reply endpoint.

This boundary is intentional. It prevents one event from receiving replies from both Render and Apps Script.

## 3. Systems and identifiers

| Component | Responsibility | Location or identifier |
|---|---|---|
| Canonical data folder | Drive folder containing the five `.gsheet` shortcuts to operational workbooks | `11L80cwOkWDEZJCxVD4SghI7zfrfwj9yL` |
| Render dashboard | Production HTTP gateway and dashboard host | `https://pscdb.onrender.com/` |
| Apps Script project | LINE processing, Gemini interpretation, sheet writes, summary API | Project `PSC WDB`, ID `1I6OABrk6kUi_AKeEO_QyAzatBzr52ldSW8dFyIl_SUuACqf5WZrvW5vQ` |
| Physical stock workbook | Current stock and Forecast support data | `1LhS7R0GeFiQ4PR_2tXqVgkFRBYX3jXSvdC0yHiOEIEM` |
| Sync database workbook | LINE report and audit storage | `1L_C9vZUOV28I4LejJcw16ey-tLvimVuw0euNWuaLFdo` |
| Farm operations workbook | Schedules and actual intake history | `195Foz8mjcLt1q5agCh28FoyJkg4VxGhMt86XqX7ZSCM` |
| Material prices workbook | Purchase price and freight matrix | `1-2n4Q2XYjGyRqoogAnS_Id1tGzUBq2bKHvHVKeXEYXM` |
| Customer PO workbook | AFT, Siam Yamamori, TNS customer PO sheets | `1FfkSYTCxUFYj3dE6VHAOWEqDa4MVU3yMz7rwjefh-Ig` |
| Dashboard repository | Source and release history | `https://github.com/aiwonsi-debug/pscdb` |

Do not place access tokens, Gemini keys, LINE secrets, session secrets, or API keys in Git. Apps Script secrets belong in Script Properties. Render secrets belong in Render environment variables.

## 4. Repository map

### 4.1 Production and deployment files

| Path | Status | Role |
|---|---|---|
| `render-dashboard/server.js` | Production | Render HTTP server, dashboard routes, LINE forwarding, live Sheets proxy |
| `render-dashboard/public/ops.html` | Production | Dashboard page served by Render |
| `render-dashboard/package.json` | Production | Render start and check commands |
| `integrations/google-apps-script/psc_wdb_web_app.gs` | Apps Script source copy | Web API, LINE handlers, Gemini, sheet writers, messaging |
| `public/ops.html` | Canonical UI mirror | Root copy of the dashboard page |
| `public/ops.html` | Canonical UI mirror | Self-contained dashboard styling and inline logic |
| `sync_render_dashboard.sh` | Release guard | Checks shared asset drift; requires `--apply` for copying |
| `sync_render_dashboard.ps1` | Windows release guard | PowerShell equivalent of the shell guard |

### 4.2 Business-rule files

| Path | Role |
|---|---|
| `shared/forecast-rules.js` | Pure Forecast rules: yield normalization, raw-volume conversion, balance, PO deduplication |
| `tests/forecast_rules.test.js` | Regression tests for the Forecast rules |
| `tests/security_remediation.test.js` | Security and integrity checks |
| `scripts/audit-duplicate-logic.js` | Duplicate-logic audit |
| `tools/inspect_intake_headers.js` | Spreadsheet header inspection utility |

### 4.3 Compatibility and support files

The repository also contains the local bot runtime and PowerShell automation. Operational stock and team data are stored in Google Drive/Sheets; no local JSON compatibility store is part of the live runtime.

Before changing one of these files, search for its imports and confirm whether it is part of a live process. Do not assume that a file is production merely because it is tracked in Git.

## 5. Google Sheets contracts

### 5.1 LINE Reports

`LINE Reports` is the normalized event register for text, stock, intake, and image events. It contains event identifiers and parsed operational fields.

Important identity fields are:

- `messageId`: LINE message identifier.
- `reportId`: business or derived report identifier.
- `syncJobId`: processing attempt identifier.
- `source`: route that accepted the event.
- `reportType`: normalized type such as `stock` or `intake`.
- `receivedAt`: webhook processing timestamp.
- `syncedAt`: spreadsheet synchronization timestamp.

Do not delete duplicate or audit rows while investigating. The ledger is evidence of what the system received and how it handled it.

### 5.2 LINE Sync Audit

`LINE Sync Audit` records accepted, duplicate, ignored, and error outcomes. When troubleshooting a report, search by `messageId` first and then by `reportId`.

Expected duplicate behavior is:

```text
same LINE messageId -> one data write, later attempts marked duplicate
same reportId       -> one business write where the duplicate guard can identify it
```

An audit row marked `duplicate` is not a processing failure. It means the system intentionally prevented a second write.

### 5.3 Dispatch & Intake Log

This is the authoritative actual-intake history. For an intake message, write only the fields supported by the report. Do not invent gross weight, price, freight, or transport details.

The standard 18-column contract is:

| Column | Meaning |
|---:|---|
| 1 | Sequence or row identifier |
| 2 | Dispatch date |
| 3 | Intake date |
| 4 | Seller or supplier |
| 5 | Origin |
| 6 | Item |
| 7 | Transporter |
| 8 | Vehicle type or registration |
| 9 | Gross or origin weight |
| 10 | Actual intake weight |
| 11 | Loss amount or percentage |
| 12 | Purchase price per kilogram |
| 13 | Purchase amount |
| 14 | Freight cost |
| 15 | Payment terms |
| 16 | Peeling yield percentage |
| 17 | Quality or operational note |
| 18 | Work status |

An intake-only message must not create an unrelated `Next Schedule` row.

### 5.4 Clean_Stock

`Clean_Stock` is the normalized stock view consumed by the dashboard and reporting tools. The dashboard expects stable item codes. The preferred codes are:

```text
Cabbage
Carrot
Onion_AFT
Onion_Chinese
```

The dashboard stock adapter expects at least:

```json
{
  "code": "Cabbage",
  "name": "กะหล่ำปลี",
  "actualQtyKg": 10925
}
```

Changing a code without updating the API adapter will make the dashboard silently display zero for that item.

### 5.5 Customer PO daily breakdown sheets

The Customer PO workbook contains the daily demand input for AFT, Siam Yamamori, and TNS. The Forecast reader must normalize dates, item codes, and quantities before aggregation.

The logical PO deduplication key is:

```text
PO number + delivery date + item code
```

Two different PO numbers on the same date and item are separate demand records. The same PO number, date, and item repeated by OCR retry or sheet duplication must count once.

## 6. Forecast rules

### 6.1 Source data must remain unchanged

The source PO sheet should retain the recorded customer quantity. Do not add a raw-volume calculation column merely to support the dashboard.

The normalized Forecast layer applies the conversion:

```text
raw volume = finished-volume demand / yield rate
```

For example:

```text
finished-volume demand = 50,600 kg
yield rate = 67% = 0.67
raw volume = 50,600 / 0.67 = 75,522.39 kg
```

The source sheet remains `50,600 kg`. The converted value is used only in the Forecast calculation where the business rule requires raw volume.

### 6.2 Balance rule

For each item and date:

```text
balance = opening stock + intake - demand
```

The implementation in `shared/forecast-rules.js` is intentionally pure. It does not read Sheets or send messages. This makes it safe to test.

### 6.3 Date basis

The dashboard must distinguish the stock count date from future Forecast dates. Historical demand before the stock count should not be subtracted again from the current stock balance. Future daily rows should apply intake and demand in chronological order.

A future row is conceptually:

```javascript
running = running + intakeForDate - demandForDate;
```

If a row is before the stock as-of date, it should be shown as historical or excluded from the future running balance according to the UI contract. It must not silently distort the current Forecast.

### 6.4 Intake column

The dashboard `Intake` column reads from `intakeByDate`. A missing date or item code must produce zero or an em dash, not duplicate the intake value across dates.

The payload should have a stable shape such as:

```json
{
  "intakeByDate": {
    "2026-09-10": {
      "Cabbage": 8500
    }
  }
}
```

## 7. LINE processing rules

### 7.1 Exactly one reply owner

The production reply owner is Apps Script. Render acknowledges the webhook and forwards the payload. Render must not call the LINE reply endpoint for the same event.

When a multiple-response incident occurs, search the codebase for:

```text
/v2/bot/message/reply
replyToken
notifyResult_
replyLine_
replyReceivingEventDirectly
```

Only Apps Script should contain the active reply path for the production route.

### 7.2 Webhook acknowledgement

Render must respond quickly with HTTP 200 after signature validation and payload receipt. Long-running OCR or Gemini work must not delay LINE acknowledgement.

If LINE retries an event, Apps Script must identify the repeated `messageId` and mark the event as duplicate rather than writing another record or sending another user reply.

### 7.3 Text intake classification

Receiving messages such as the following must be treated as intake:

```text
18/9/26 รับกะหล่ำปลีเฮียหนิง
จำนวน 7,425 กก.
สุ่มปอก 100 กก.
ปอกได้ 74.93 กก.
```

The receiving detector must not require a space between the product and supplier. The classification should recognize `รับกะหล่ำปลีเฮียหนิง` and similar forms.

The response should begin with:

```text
✅ [บันทึกรับเข้า/รับของ PSC เรียบร้อย]
```

It must not report the same intake as a dispatch or loading job.

### 7.4 Image PO classification

When OCR or Gemini identifies a recognizable PO number such as `PO6909-2505`, the classification must force the business category to `customer_po` even if the model returns an uncertain category.

OCR normalization should handle common substitutions such as:

```text
P0 -> PO
P06909 -> PO6909
whitespace or punctuation differences -> canonical PO number
```

A successful image path should produce:

1. `LINE Reports` audit evidence.
2. A normalized Customer PO register record.
3. A corresponding demand record only once.
4. One LINE response.

## 8. Production endpoints

### 8.1 Dashboard endpoints

```text
GET https://pscdb.onrender.com/
GET https://pscdb.onrender.com/api/health
GET https://pscdb.onrender.com/api/live-sheets?t=<cache-buster>
GET https://pscdb.onrender.com/api/team-status?force=1
```

The `/api/live-sheets` response should include:

```json
{
  "ok": true,
  "timestamp": "2026-09-19T00:00:00.000Z",
  "stock": [],
  "schedules": [],
  "prices": [],
  "demandByDate": {},
  "intakeByDate": {},
  "demandSource": "Customer PO daily breakdowns"
}
```

### 8.2 Apps Script summary endpoint

The Apps Script web-app endpoint is configured in the Render `GAS_WEBHOOK_URL` environment variable. Do not paste credentials or tokens into this document. The endpoint supports the summary response used by Render.

The active production Apps Script deployment reported during the previous handover was **version 54**. Always verify the current deployment in Apps Script before relying on this number.

## 9. Deployment procedure

### 9.1 Local validation

Run from the repository root:

```bash
npm run check
npm test
node scripts/audit-duplicate-logic.js
git diff --check
./sync_render_dashboard.sh
```

The current expected results are:

```text
Forecast rules: 6 assertions passed
Security suite: 15 passed, 0 failed
Duplicate audit: no exact or divergent exported-function duplicates
Shared asset sync check: all listed files OK
```

### 9.2 Dashboard release

1. Make the change in the correct runtime file.
2. Run `npm run check`.
3. Run `npm test`.
4. Run the duplicate audit.
5. Run `./sync_render_dashboard.sh`.
6. If shared assets intentionally changed, review the diff and run `./sync_render_dashboard.sh --apply`.
7. Confirm `public/ops.html` and `render-dashboard/public/ops.html` are identical when the UI changed.
8. Review `git diff --stat` and `git diff --check`.
9. Commit with a specific message.
10. Push to `main`.
11. Wait for Render auto-deployment.
12. Verify `/api/health`, `/api/live-sheets`, and the dashboard UI.

Do not use `--apply` to synchronize the Node servers. They are not currently interchangeable.

### 9.3 Apps Script release

1. Open the `PSC WDB` Apps Script project.
2. Confirm the edited file and review the complete changed function.
3. Save the project.
4. Run the relevant diagnostic function if available.
5. Confirm there is no syntax error.
6. Create a new version.
7. Open **Deploy → Manage deployments**.
8. Update the active web-app deployment to the new version.
9. Record the new version number and deployment timestamp.
10. Call the summary endpoint and confirm stock, demand, intake, and yield metadata.
11. Send a new LINE test event with a new `messageId`.
12. Confirm the response and all target sheets.

Saving Apps Script is not the same as updating the active web-app deployment.

## 10. Test procedures

### 10.1 Forecast test

Verify:

```text
50,600 / 67% = 75,522.39 kg
opening stock + intake - demand = balance
same PO + date + item = one demand row
same date + different PO = separate demand rows
```

### 10.2 LINE text intake test

Use a new message:

```text
19/9/26 รับกะหล่ำปลีเฮียหนิง
จำนวน 7,425 กก. (18 เลท 9 ตะกร้า)
ขนาดกลาง-ใหญ่
สภาพโดยรวมสวย
สุ่มปอก 100 กก.
ปอกได้ 74.93 กก.
```

Verify:

1. Exactly one LINE response.
2. Response starts with the intake confirmation.
3. One new row appears in `LINE Reports`.
4. One new row appears in `Dispatch & Intake Log`.
5. No unintended row appears in `Next Schedule`.
6. Duplicate resend is marked duplicate and does not create another business row.

### 10.3 LINE image PO test

Send one PO image with a visible PO number such as `PO6909-2505`.

Verify:

1. The image event appears in the audit log.
2. The normalized PO number is `PO6909-2505`, not `P06909-2505`.
3. Category is `customer_po`.
4. Customer PO Register contains one record.
5. Forecast demand contains one record for the PO/date/item key.
6. LINE sends one response only.
7. Sending the same LINE event again does not create a second record.

### 10.4 Dashboard verification

Call:

```bash
curl -sS -L 'https://pscdb.onrender.com/api/live-sheets?t=1' | jq .
curl -sS -L 'https://pscdb.onrender.com/api/team-status?force=1' | jq .
```

Check that:

- `stock` contains stable item codes.
- `demandByDate` has the expected PO demand.
- `intakeByDate` has the expected intake values.
- `schedules` has pending records where applicable.
- the Forecast table shows `Intake` values on the correct dates.
- cumulative balance equals opening stock plus intake minus demand.
- duplicate PO rows are absent.

## 11. Troubleshooting guide

### 11.1 LINE sends two or four replies

Check in this order:

1. Search Render logs for `replyReceivingEventDirectly`. It must not be active in the production route.
2. Search Apps Script executions for the same `messageId`.
3. Search `LINE Sync Audit` for duplicate and accepted rows.
4. Check whether LINE retried the webhook because Render did not return 200 quickly.
5. Check that Apps Script `notifyResult_()` is called once per accepted event.
6. Check whether a second deployment or old webhook URL is still configured in LINE Developers Console.

Do not delete the audit rows. They identify whether the problem is duplicate delivery or duplicate reply code.

### 11.2 PO is received but not registered

Check:

1. Image download response code.
2. Gemini or OCR parsed result.
3. Canonical PO number after normalization.
4. Classification override for recognizable `PO####-####`.
5. Customer PO Register writer.
6. Duplicate key lookup.
7. Apps Script deployment version used by the LINE webhook.

A report saying `Image report saved (undefined)` means the image path completed but classification did not produce a valid business category. The fix belongs in classification normalization, not in the dashboard.

### 11.3 Forecast is too large

Check:

1. Whether the same PO exists more than once in the source register.
2. Whether the same PO exists with OCR variants such as `P0` or `P06909`.
3. Whether demand is being added once per source row and again from a duplicate register.
4. Whether raw-volume conversion is being applied twice.
5. Whether the dashboard applies yield conversion after Apps Script already converted the amount.
6. Whether AFT and another customer sheet are both contributing the same row.

The source quantity should remain unchanged. Only one layer should convert finished volume to raw volume.

### 11.4 Intake column is empty

Check:

1. Apps Script summary payload has `intakeByDate`.
2. Dates are normalized to `YYYY-MM-DD`.
3. Item codes match dashboard codes.
4. Render does not discard `intakeByDate` while proxying the response.
5. Dashboard passes `intakeByDate` into the Forecast renderer.
6. The intake date is not being confused with dispatch date.

### 11.5 Stock displays zero

Check the `code` field first. The dashboard expects `Cabbage`, `Carrot`, `Onion_AFT`, and `Onion_Chinese`. A Thai name or alternate field such as `itemCode` will not match unless the adapter explicitly maps it.

## 12. Rollback procedure

### 12.1 Render rollback

1. Identify the last known-good commit in GitHub.
2. Confirm that it does not reintroduce the Render direct-reply path.
3. Revert the specific commit or deploy the previous known-good commit according to the Render service controls.
4. Verify `/api/health`.
5. Verify `/api/live-sheets`.
6. Verify one dashboard load.
7. Verify that LINE still reaches Apps Script.

Do not roll back by copying `webhook_server.js` over `render-dashboard/server.js`.

### 12.2 Apps Script rollback

1. Open Apps Script project history or deployment management.
2. Identify the last known-good version.
3. Update the active web-app deployment to that version.
4. Confirm the deployment URL did not change.
5. Run `doGet` or call the summary endpoint.
6. Send a new controlled test message.
7. Record the rollback version and reason in the incident log.

### 12.3 Data correction

Do not delete rows as the first response to a duplicate. First establish the event key and audit history. If a business correction is approved, preserve the original row and add a correction or audit note rather than silently rewriting the operational history.

## 13. Security requirements

- Never commit LINE channel access tokens.
- Never commit LINE channel secrets.
- Never commit Gemini API keys.
- Never place API keys in URLs.
- Keep write endpoints authenticated.
- Keep session cookies `HttpOnly` and `Secure` in production.
- Keep CORS restricted to known origins.
- Keep request-body limits enabled.
- Validate stock item codes and quantities.
- Use atomic writes for local JSON state.
- Do not re-enable remote shell execution from chat commands.

The current security remediation suite passed 15 checks with zero failures during this handover.

## 14. Maintenance standards

Every change should answer four questions:

1. Which system owns this behavior?
2. Which source is authoritative?
3. How is duplicate delivery handled?
4. Which test proves the change?

Keep business rules pure and small. Keep API adapters responsible for field mapping. Keep spreadsheet writers responsible for sheet layout. Keep LINE messaging responsible for user responses. Do not mix these responsibilities in a single new helper.

Before merging a change, run:

```bash
npm run check
npm test
node scripts/audit-duplicate-logic.js
./sync_render_dashboard.sh
git diff --check
```

## 15. Known limitations and future work

The Apps Script source remains a large multi-responsibility file. The next maintainability phase should split it into multiple `.gs` files without changing behavior.

The root and Render Node servers remain separate. A later refactor should extract shared HTTP utilities and clearly distinguish local-only routes from production routes. Until then, treat them as different applications.

The dashboard still contains a compact inline script. The Forecast renderer should eventually consume normalized Forecast rows from the API rather than reconstructing all business calculations in the browser.

The Apps Script repository copy and the active deployed version must be checked for drift. The active deployment version is an operational fact and should be recorded after every deployment.

## 16. Handover acceptance checklist

A new maintainer should complete the following before accepting ownership:

- [ ] Access to the GitHub repository is confirmed.
- [ ] Access to the Render service is confirmed.
- [ ] Access to Apps Script project `PSC WDB` is confirmed.
- [ ] Access to the required Google Sheets is confirmed.
- [ ] LINE Developers Console webhook URL is confirmed.
- [ ] LINE channel secret is stored only in the correct secret store.
- [ ] Gemini key is stored only in Apps Script properties.
- [ ] Current Apps Script deployment version is recorded.
- [ ] `/api/health` returns `ONLINE`.
- [ ] `/api/live-sheets` returns stock and demand data.
- [ ] `npm test` passes.
- [ ] Forecast formula test passes.
- [ ] One controlled intake test passes.
- [ ] One controlled image PO test passes.
- [ ] Duplicate resend is rejected or marked duplicate.
- [ ] Exactly one LINE reply is observed.
- [ ] Rollback procedure has been reviewed.

## References

[1]: https://github.com/aiwonsi-debug/pscdb "PSCDB source repository"
[2]: https://github.com/aiwonsi-debug/pscdb/blob/main/docs/REPOSITORY_STRUCTURE.md "PSCDB repository structure"
[3]: https://github.com/aiwonsi-debug/pscdb/blob/main/integrations/google-apps-script/psc_wdb_web_app.gs "PSCDB Apps Script source"
[4]: https://github.com/aiwonsi-debug/pscdb/blob/main/tests/security_remediation.test.js "PSCDB security test suite"
[5]: https://github.com/aiwonsi-debug/pscdb/blob/main/shared/forecast-rules.js "PSCDB Forecast rules"

*Prepared by Manus AI.*
