# PSC Project Maintainability Audit

**Inspection date:** 19 September 2026  
**Repository:** `aiwonsi-debug/pscdb`  
**Branch inspected:** `main` at commit `7e24c2b`  
**Scope:** Google Apps Script, Render dashboard, LINE webhook flow, local runtime, deployment scripts, tests, documentation, and repository hygiene.

## Executive conclusion

The project is operationally functional, but it is not yet lean or easy to maintain. The main problem is not the amount of code alone. It is the presence of **multiple production-shaped copies of the same responsibilities** with different deployment assumptions.

The highest-risk issue is the mismatch between the documented deployment rule and the current source tree. The documentation and synchronization scripts say that the root runtime is canonical and that `render-dashboard/` is a deployment copy. However, `webhook_server.js` and `render-dashboard/server.js` have already diverged. The Render copy contains production-specific changes that are not present in the root copy, while the synchronization scripts are designed to overwrite the Render copy from the root. Running the sync script without reviewing the diff could therefore remove live behavior.

The second major issue is the Google Apps Script monolith. The file `integrations/google-apps-script/psc_wdb_web_app.gs` contains configuration, API endpoints, LINE routing, image handling, Gemini calls, spreadsheet synchronization, messaging, forecast aggregation, utilities, and setup tools in one file. This makes small changes difficult to review and increases the chance of accidental broad edits.

The project should be reorganized in stages. First, make the deployment authority explicit and stop unsafe copying. Second, isolate the forecast and deduplication rules into tested modules. Third, split the Apps Script source by responsibility. Fourth, retire or clearly label legacy local-runtime code.

## Current architecture

The live data path is:

```text
LINE webhook
  -> Google Apps Script doPost
     -> text/image classification
     -> idempotency checks
     -> Google Sheets writes
     -> stock and PO synchronization
  -> Render /api/live-sheets
     -> dashboard forecast renderer
```

The repository also contains a second Node runtime, local JSON compatibility stores, bot utilities, CLI tools, and a mirrored dashboard tree. These are useful only if their ownership and deployment status are explicit.

## Findings by priority

### P0 — Deployment source-of-truth conflict

`docs/REPOSITORY_STRUCTURE.md` states that root files are the source of truth. `sync_render_dashboard.sh` and `sync_render_dashboard.ps1` copy `webhook_server.js` to `render-dashboard/server.js` before deployment. The current files are not equivalent. The route sets differ, and the Render server includes behavior that the root server does not have, including a direct receiving-event reply path and a different `/api/team-status` implementation.

This creates a dangerous maintenance workflow:

1. An engineer fixes the Render file because that is the deployed service.
2. The synchronization script later copies the root file over it.
3. The production fix disappears or the two environments behave differently.

**Required decision:** choose one of the following and document it in the repository:

| Approach | Tradeoff | Recommendation |
|---|---|---|
| One shared server module used by both runtimes | Requires a short refactor, but prevents drift | Preferred |
| Root server is canonical and Render is a generated copy | Simple deployment, but Render-specific behavior must be removed or parameterized | Acceptable temporary state |
| Root and Render are intentionally separate services | Maximum flexibility, but requires separate tests and release ownership | Not recommended for the current team size |

Until the decision is implemented, do not run either synchronization script automatically.

### P0 — Duplicate LINE response risk

The Render server contains `replyReceivingEventDirectly`, while the same LINE payload is also forwarded to Apps Script through `syncToGoogleSheets(payload)`. Apps Script has its own LINE reply and notification functions. This creates two possible responders for one event.

The current production rule should be exactly one of these:

```text
LINE -> Apps Script -> one reply
```

or:

```text
LINE -> Render -> one reply, then Apps Script writes without replying
```

The system must not allow both layers to reply to the same `replyToken`. The existing four-response incident is consistent with multiple handlers or retries being able to produce visible replies. The idempotency ledger protects spreadsheet writes, but it does not by itself prevent multiple LINE reply calls.

**Required design rule:** only one component owns `replyToken`. Every other component must be write-only or notification-only for that event.

### P1 — Forecast logic is not centralized

The forecast rule is currently distributed across Apps Script, the Render API transformation, and the dashboard HTML. The important business rule is:

```text
forecast balance = opening stock + intake - demand
```

The yield conversion is a separate rule:

```text
raw volume = finished-volume demand / yield rate
```

These rules should be implemented once in a small, deterministic module and tested with examples such as:

```text
50,600 / 0.67 = 75,522.39 kg
```

The source PO sheets should retain the original quantity. Yield conversion should happen in the normalized forecast data, not by adding calculation columns to source sheets.

The untracked file `scripts/patch_forecast_renderer.py` is a one-off patch tool. It should not remain in the normal deployment path. Either convert the resulting change into the canonical source with a regression test, or move the script into an explicitly named historical migration area.

### P1 — Google Apps Script is a large monolith

The Apps Script source currently combines at least eight responsibilities:

1. Configuration and spreadsheet identifiers.
2. `doGet` dashboard API assembly.
3. `doPost` webhook parsing.
4. Text and image LINE handlers.
5. Gemini interpretation and sanitization.
6. Spreadsheet synchronization.
7. LINE reply and push messaging.
8. Forecast and date/quantity utilities.

The existing top-to-bottom section comments help orientation, but they do not provide module boundaries. The safer maintainable layout is:

```text
integrations/google-apps-script/
  00_Config.gs
  10_WebApi.gs
  20_LineWebhook.gs
  30_ImageClassification.gs
  40_TextClassification.gs
  50_SheetWriters.gs
  60_Forecast.gs
  70_LineMessaging.gs
  90_Utilities.gs
  99_Diagnostics.gs
```

Apps Script files share one project namespace, so this split does not require a package system. It only reduces edit size and makes ownership visible.

### P1 — Source-code copies are only partially controlled

The two `ops.html` files are byte-identical, which is good. The frontend JavaScript files are not named consistently: the root tree contains `public/js/main_dashboard.js`, while the Render tree contains `render-dashboard/public/js/ops.js`. The HTML currently uses inline JavaScript, so the external files appear to be legacy or unused. This should be confirmed and then simplified.

A maintainable frontend should have one of these forms:

```text
public/ops.html              canonical page
public/js/ops.js             canonical page logic
public/css/ops.css           canonical styles
render-dashboard/public/...  generated deployment copy
```

or, if the inline script is intentional, the unused external JavaScript files should be archived or removed after confirming they are not loaded by any route.

### P1 — Root and Render packages are not explicit

The root `package.json` starts `webhook_server.js`. The Render package starts `server.js`. Neither package defines a test command, lint command, or validation command. This makes it easy to deploy code that passes syntax checks but has not passed the project’s security suite.

At minimum, each runtime package should expose:

```json
{
  "scripts": {
    "start": "node ...",
    "test": "node ../tests/security_remediation.test.js",
    "check": "node --check ..."
  }
}
```

The exact paths should be adjusted to the final single-runtime structure.

### P2 — Tests are useful but not integrated

The security suite passes all 15 checks when run directly with:

```text
node tests/security_remediation.test.js
```

The repository does not currently expose this through `npm test`, so a normal contributor may believe the project has no automated tests. The live HTTP audit is valuable but mutates local runtime state and starts a server directly from the test file. It should be isolated under an integration-test command and should always restore state in a `finally` block.

The duplicate-logic audit reports no exact or divergent exported-function duplicates among the six scanned JavaScript files. This is useful, but the audit intentionally excludes `public/` and `data/`, and it does not detect duplicated business rules inside large files. It therefore does not prove that forecast or LINE handling is single-sourced.

### P2 — Repository contains legacy and compatibility layers without clear status

The repository includes a local bot runtime, a Render runtime, inventory services, CLI scripts, PowerShell automation, JSON fallback stores, and multiple operational helpers. This is acceptable only if each item is marked as one of:

- **Production:** deployed and actively maintained.
- **Support:** used for diagnostics or controlled operations.
- **Compatibility:** retained temporarily for old workflows.
- **Archive candidate:** not used by the current production path.

The current documentation describes some of these categories, but the directory structure does not enforce them. A new maintainer must inspect code to learn whether a file is live.

### P2 — Configuration is spread across code and environment

The Render server contains environment-driven settings, but it also contains fallback values for operational access configuration. The security tests verify that the write endpoints fail closed in the tested path, and all 15 security checks pass. Nevertheless, configuration should be moved into one validated module that distinguishes required production secrets from development defaults.

Google Apps Script correctly reads sensitive keys such as the Gemini key and LINE access token from Script Properties. Spreadsheet IDs and sheet names should likewise be centralized in a clearly documented configuration block or a configuration sheet, with validation at startup or on a diagnostic endpoint.

## Recommended target structure

The following layout is intentionally conservative. It keeps the current technologies while making ownership clearer.

```text
pscdb/
  apps-script/
    00_Config.gs
    10_WebApi.gs
    20_LineWebhook.gs
    30_Classification.gs
    40_SheetSync.gs
    50_Forecast.gs
    60_LineMessaging.gs
    90_Utilities.gs

  dashboard/
    server.js
    public/
      ops.html
      js/ops.js
      css/ops.css

  shared/
    forecast-rules.js
    item-codes.js
    date-utils.js

  scripts/
    audit-duplicate-logic.js
    validate-deployment.js
    inspect-intake-headers.js

  tests/
    unit/forecast-rules.test.js
    unit/date-utils.test.js
    integration/line-webhook.test.js
    integration/live-http-audit.test.js
    security/security-remediation.test.js

  docs/
    architecture.md
    deployment.md
    operations.md
    decisions/
```

If Apps Script cannot import JavaScript modules directly, the shared rules should be maintained as a reviewed copy or generated into Apps Script. The important requirement is that the source of the rule is explicit and that both implementations have the same fixture tests.

## Recommended work order

### Phase 1: Stabilize without changing business behavior

First, declare the single LINE reply owner. Remove or disable every other reply path for the same event. Add a log field containing `eventId`, `messageId`, `replyOwner`, and `replyAttempted` so a four-response incident can be traced to exact calls.

Second, stop the unsafe root-to-Render overwrite. Change the sync script to fail when the source and destination differ unless the operator passes an explicit `--overwrite` or equivalent confirmation flag. This converts silent production drift into a visible release decision.

Third, add `check`, `test:security`, and `test:integration` commands. These changes are low risk and immediately improve release discipline.

### Phase 2: Centralize the business rules

Extract item codes, date normalization, quantity parsing, yield conversion, forecast balance, and PO deduplication into small deterministic functions. Add fixtures for the known AFT case, duplicate PO rows, repeated LINE webhook events, and intake on a forecast date.

The forecast API should return normalized records such as:

```json
{
  "date": "2026-09-10",
  "itemCode": "Cabbage",
  "openingStockKg": 10925,
  "intakeKg": 8500,
  "demandKg": 12500,
  "balanceKg": 6925,
  "sourceKeys": ["AFT|PO6909-2505|2026-09-10|Cabbage"]
}
```

This makes the dashboard a renderer rather than a second calculation engine.

### Phase 3: Split the Apps Script file

Move functions into the proposed `.gs` files without changing logic. Deploy and verify after each group. Do not combine the split with a formula change or a spreadsheet-layout change.

The forecast function should accept normalized sheet rows and a yield configuration. It should not know about LINE, Gemini, or reply tokens.

### Phase 4: Remove dead copies and clarify compatibility

After production traffic confirms which local runtime paths are still used, archive or remove unused JavaScript mirrors and one-off patch scripts. Retain sanitized examples and diagnostic tools. Update the README and handover document so a new maintainer can identify the live entry point in less than one minute.

## Acceptance criteria for a maintainable release

A release should be considered structurally complete when all of the following are true:

1. There is one documented production LINE webhook route.
2. There is one documented owner of the LINE `replyToken`.
3. Root and Render server code cannot drift silently.
4. Forecast math is implemented in one named rule set and covered by tests.
5. Source PO sheets remain unchanged by forecast calculations.
6. PO deduplication uses an explicit key such as `PO + date + item`.
7. The dashboard consumes normalized forecast data and does not recreate business calculations in inline HTML.
8. `npm test` runs the security suite successfully.
9. A deployment check confirms that the deployed copy matches the canonical source.
10. Documentation identifies production, support, compatibility, and archive-candidate files.

## Inspection validation

The following checks were completed during this audit:

- Node syntax checks passed for `webhook_server.js` and `render-dashboard/server.js`.
- The security remediation suite passed: **15 passed, 0 failed**.
- The duplicate-logic audit found no exact or divergent exported-function duplicates in its scanned set.
- `public/ops.html` and `render-dashboard/public/ops.html` are currently byte-identical.
- The working tree contains one untracked one-off script: `scripts/patch_forecast_renderer.py`.
- The root and Render server files are materially different despite the repository’s root-canonical synchronization rule.

## References

[1]: https://github.com/aiwonsi-debug/pscdb "PSCDB source repository"
[2]: https://github.com/aiwonsi-debug/pscdb/blob/main/docs/REPOSITORY_STRUCTURE.md "PSCDB repository structure and deployment rules"
[3]: https://github.com/aiwonsi-debug/pscdb/blob/main/sync_render_dashboard.sh "PSCDB Render synchronization script"
[4]: https://github.com/aiwonsi-debug/pscdb/blob/main/integrations/google-apps-script/psc_wdb_web_app.gs "PSCDB Google Apps Script source"
[5]: https://github.com/aiwonsi-debug/pscdb/blob/main/tests/security_remediation.test.js "PSCDB security remediation test suite"

*Prepared by Manus AI.*
