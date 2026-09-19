# PSCDB Repository Reduction Audit

**Audit date:** 2026-09-19  
**Repository:** `aiwonsi-debug/pscdb`  
**Audited commit:** `e0c5a0f`  
**Scope:** file count, code volume, runtime ownership, duplicate modules, unused assets, legacy utilities, tests, and deployment risk.

## Executive conclusion

The repository can be reduced substantially without changing the live product. The current tree contains **94 tracked files**, approximately **18,872 lines of JavaScript, HTML, CSS, shell, PowerShell, and Apps Script**, and approximately **1.2 MB** of tracked content.

A conservative cleanup can remove or archive approximately **9 files and 4,210 lines**. This removes files that are either unreferenced or exact duplicate deployment copies. A broader cleanup can remove approximately **19 files and 7,300 lines**, but it requires confirming that the legacy inventory CLI and its repository layer are no longer needed. An architectural consolidation of the two server runtimes could remove substantially more code, but it should not be attempted as a simple deletion because the root and Render servers intentionally diverge in route ownership.

The largest immediate reduction is not in the production servers. It is in **unused dashboard assets and duplicated support modules**. The production-critical surface should remain small and explicit: the root webhook runtime, the Render runtime, the bot and LINE handlers, the Apps Script integration, the shared forecast rules, the live dashboard HTML, and the tests that protect these boundaries.

## Current repository measurements

| Measure | Current value |
|---|---:|
| Tracked files | 94 |
| Tracked repository size | Approximately 1.2 MB |
| Code and markup lines | Approximately 18,872 |
| JavaScript files | 53 |
| Markdown files | 10 |
| Example files | 8 |
| Production Node entrypoints | 2 |
| Google Apps Script source files | 1 |
| Dashboard HTML copies | 2, byte-identical |
| Live HTTP audit test copies | 2, functionally overlapping |

The two production Node entrypoints are `webhook_server.js` and `render-dashboard/server.js`. They are not identical. The root runtime owns the main webhook and local gateway responsibilities, while the Render runtime owns the public deployment behavior. Existing synchronization scripts can overwrite the Render copy, so they should be treated as release tools rather than routine formatting tools.

## Findings by category

### 1. Unused dashboard assets are safe reduction targets

Neither HTML dashboard copy references the tracked external JavaScript or CSS assets. Both HTML files contain their active JavaScript and styles inline, and they only load the external Chart.js library and Google fonts. The following four files are therefore unused by the current dashboard pages:

| Files | Lines | Bytes | Assessment |
|---|---:|---:|---|
| `public/js/main_dashboard.js` | 1,918 | 89,006 | Remove after one final browser smoke test |
| `render-dashboard/public/js/ops.js` | 1,910 | 88,665 | Remove after one final browser smoke test |
| `public/css/ops.css` | 1 | 47 | Remove |
| `render-dashboard/public/css/ops.css` | 1 | 47 | Remove |
| **Total** | **3,830** | **177,765** | **High-confidence cleanup** |

The security test contains an optional check for `public/js/ops.js`, so that assertion should be simplified before deleting the file. The README also names the unused asset and should be updated at the same time.

### 2. Exact duplicate support modules should have one owner

`line_notifier.js` and `render-dashboard/line_notifier.js` are byte-identical. `memory_engine.js` and `render-dashboard/memory_engine.js` are also byte-identical. The Render runtime can import the root-owned modules through relative paths because the Render service is built from the same repository.

Removing the two Render copies would remove **572 lines and approximately 25 KB**. This is safe only after checking that the Render deployment includes the repository root and after running the Render server tests. The preferred design is one shared module, not two synchronized copies.

### 3. The live HTTP audit test is duplicated

`tests/live_http_audit.test.js` and `render-dashboard/test_live_http_audit.js` contain overlapping live HTTP audit logic. The Render package can call the root test with a relative path, or the test can be moved to a shared test directory. Removing the Render copy would remove **455 lines and approximately 19 KB**.

This is a moderate-confidence reduction because the two files may have small deployment-specific assumptions. The correct approach is to compare their assertions and preserve the stricter checks in one shared test.

### 4. Legacy inventory storage is now inconsistent with the Drive-only design

The live runtime no longer uses local operational JSON files. However, the repository still contains a legacy inventory stack consisting of `core/app-context.js`, `repositories/json-file-store.js`, `repositories/inventory-repository.js`, `services/inventory-service.js`, `scripts/inventory-cli-adapter.js`, `scripts/record_cli.js`, and `scripts/smoke-test-inventory.js`.

This stack totals **2,107 lines and approximately 54 KB**. Its purpose is local JSON inventory management, which conflicts with the current Google Drive/Sheets source-of-truth policy. It is a strong archive-or-remove candidate, but only after confirming that nobody still uses the CLI for offline work. Removing it immediately would break the documented `scripts/package.json` CLI surface, so it belongs in the second cleanup phase rather than the first.

### 5. Several standalone utilities appear unreferenced

The following files have no callers in the current runtime, test, or deployment path based on repository-wide reference inspection:

- `agy-quota-dashboard.js`
- `cleanup_cards_state.js`
- `google_sheets_sync.js`
- `validate_intake_patch.js`
- `render-dashboard/generate_shipment_report.js`

Together they contain **380 lines and approximately 14 KB**. They should be moved to a dated `archive/` area or removed after checking whether they are invoked manually outside GitHub. Their latest commit dates and lack of inbound references indicate that they are maintenance utilities rather than active runtime modules.

### 6. The two servers and Apps Script should not be deleted as duplicate files

The two Node servers total **2,647 lines**. The Apps Script integration contains another **1,451 lines**. Together they represent the central production behavior, not removable duplication.

The servers do contain duplicated concepts, but they also have different route ownership and deployment behavior. The existing maintainability audit specifically warns that blindly copying the root server over the Render server can remove live behavior. Consolidation should therefore be a separate architecture project involving shared route modules, not a file deletion exercise.

### 7. Documentation is large but valuable; it should be consolidated carefully

The repository contains nine documentation files totaling approximately **1,600 lines**. The two largest handover files contain historical context that is useful during incident response but costly to maintain. The best reduction is to retain one current handover, one repository structure guide, and one focused LINE intake runbook. Historical audit documents can be moved to an archive directory or retained as Git history.

Documentation reduction can likely remove or archive **4–6 files and 700–1,000 lines** without affecting runtime. It will reduce maintenance effort more than deployment size.

## Quantified cleanup scenarios

| Scenario | Files removed or archived | Approximate lines | Approximate bytes | Risk | Recommendation |
|---|---:|---:|---:|---|---|
| Conservative | 9 | 4,210 | 192 KB | Low | Do first |
| Balanced | 14–19 | 5,800–7,300 | 240–330 KB | Medium | Do after one release cycle |
| Aggressive | 20–30 | 7,500–10,000 | 300–450 KB | Medium to high | Requires ownership decisions |
| Server consolidation | Not estimated as deletion | Potentially several thousand | Not estimated | High | Separate architecture project |

The **conservative** scenario consists of the four unused dashboard assets, the two duplicate Render support modules, the duplicate Render HTTP test, and the five unreferenced utility files. The exact file count is nine only if the utility files are removed in the same phase; otherwise the pure high-confidence asset and duplicate-module cleanup is seven files and approximately 4,857 lines.

The **balanced** scenario adds the legacy inventory stack after confirming that the local CLI is no longer needed. It also consolidates selected documentation. The **aggressive** scenario additionally reduces mirrored HTML and test structures, but it should preserve one clear deployment contract and one browser smoke test.

## Recommended execution order

First, remove the four unused dashboard assets and update the optional security-test check and README. This is the highest-return, lowest-risk change because the live HTML does not reference those assets.

Second, centralize `line_notifier.js` and `memory_engine.js` and update Render imports. Run the root and Render syntax, security, deployment, duplicate-logic, and live HTTP checks before and after the change.

Third, merge the two live HTTP audit tests into one shared test. Keep the stricter assertions and update the Render package script to invoke the shared test.

Fourth, archive or remove the unreferenced utility scripts. Add a short `docs/ARCHIVED_TOOLS.md` note listing their former purpose if future maintainers may need them.

Fifth, decide whether the local inventory CLI is an active product requirement. If it is not, remove the inventory repository stack and its package manifest. If it is still needed, rewrite it as a Google Sheets API client instead of retaining a local JSON storage layer.

Finally, treat server consolidation as a separate project. The correct target is a shared route and data-source layer, while preserving separate entrypoints for root webhook and Render deployment behavior.

## Final assessment

The project is already smaller in operational data because the six local JSON files were removed and archived to Google Drive. The next meaningful reduction comes from removing **unused frontend assets, duplicate support modules, duplicate tests, and unreferenced utilities**. A realistic first phase can reduce the repository by approximately **4,200 lines and 190 KB** without changing the live data model or the public dashboard behavior.

The project should not attempt to reduce file count by deleting the two servers or the Apps Script monolith. Those files are large because they hold distinct production responsibilities. Their reduction requires refactoring with route-level regression tests, not cleanup by deletion.

## References

[1]: https://github.com/aiwonsi-debug/pscdb/tree/main "PSCDB repository"

[2]: https://github.com/aiwonsi-debug/pscdb/blob/main/docs/PSC_PROJECT_MAINTAINABILITY_AUDIT_2026-09-19.md "PSCDB maintainability audit"

[3]: https://github.com/aiwonsi-debug/pscdb/blob/main/docs/REPOSITORY_STRUCTURE.md "PSCDB repository structure"

## Cleanup execution result

The recommended cleanup was executed on the repository after the audit. The tree decreased from **94 to 70 tracked files**, from approximately **1.2 MB to 892 KB**, and from approximately **18,872 to 11,397 code and markup lines**. The cleanup removed **25 files and 7,539 lines** while preserving both production server entrypoints, the Apps Script source, the shared forecast rules, and the self-contained dashboard.

The cleanup also consolidated the Render runtime onto the shared root notifier and memory modules, consolidated the live HTTP audit test, removed the obsolete local-inventory CLI and repository layer, removed unreferenced dashboard assets and maintenance utilities, and enforced cookie-only session authentication for team write endpoints.

The final validation passed the root checks, unit tests, security suite with 15 passing assertions, deployment guard, duplicate-logic audit with no duplicates, root live HTTP audit with 32 passing tests, Render checks, Render tests, Render live HTTP audit, dashboard mirror comparison, synchronization check, and whitespace validation. The cleanup was pushed to the `main` branch after verification.
