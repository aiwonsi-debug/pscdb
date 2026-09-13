# PSC AI Operations — Full Security & Data Integrity Audit

**Date:** 2026-09-04  
**Verdict:** FAIL — not production-safe in current form.

## Executive conclusion

The dominant risks are unauthorized privileged control through Telegram/PowerShell/AGY, unauthenticated HTTP write endpoints, exposed credentials, false-certainty ground-truth validation, and multiple competing sources of truth.

## Findings

### C-01 — CRITICAL: Telegram bot authorization is not enforced

**Evidence:** handleCommand() accepts commands based on chatId but the inspected command surface does not establish a fixed allowlist before privileged operations. The code initializes adminChatId from config but privileged handlers are not gated by a verified identity.

**Impact:** Any Telegram user able to message the bot may reach privileged functionality. This is the primary security boundary failure.

**Fix:** Require a fixed TELEGRAM_ADMIN_CHAT_IDS allowlist and reject all privileged commands before parsing or execution. Do not dynamically promote the sender to admin.

### C-02 — CRITICAL: Remote PowerShell execution through Telegram

**Evidence:** bot.js contains /cmd, /sh and /ps handling and invokes PowerShell through execSilent().

**Impact:** If Telegram authorization is bypassed or absent, the attacker obtains arbitrary command execution on the Windows host.

**Fix:** Remove the general shell command surface from production. If retained, use a strict allowlist of non-shell operations and execute parameterized programs without a shell.

### C-03 — CRITICAL: AGY launched with --dangerously-skip-permissions

**Evidence:** The AGY execution path launches the CLI with --dangerously-skip-permissions.

**Impact:** Natural-language Telegram input becomes a high-privilege agent instruction path. This materially expands blast radius from data access to host modification.

**Fix:** Never combine untrusted Telegram input with unrestricted agent permissions. Use a sandbox/least-privilege account and explicit tool allowlists.

### C-04 — CRITICAL: Telegram bot credential committed in source

**Evidence:** webhook_server.js contains a real-looking TELEGRAM_BOT_TOKEN fallback. bot.js reads telegram_config.json, and the repository is public.

**Impact:** The token must be treated as compromised. Anyone with the repository can attempt to control the bot.

**Fix:** Immediately revoke/rotate the bot token; remove all secrets from source and Git history; use environment variables or an OS secret store.

### C-05 — CRITICAL: Unauthenticated destructive/write HTTP APIs

**Evidence:** webhook_server.js exposes POST /api/stock-update, /api/team-update, /api/team-reset, /api/loading-report, /api/sync-quota and /api/reboot-bot without an authorization check in the inspected server.

**Impact:** A reachable port/reverse proxy can permit arbitrary state modification or restart signaling.

**Fix:** Bind to localhost unless remote access is required; otherwise require authentication, authorization, CSRF protection where applicable, request limits, and schema validation.

### C-06 — CRITICAL: stock_inventory.json can be overwritten wholesale

**Evidence:** POST /api/stock-update writes the parsed request body directly to stock_inventory.json and returns success even if the write fails.

**Impact:** A malformed or malicious payload can replace the complete stock ledger. Failure can be reported as success.

**Fix:** Accept only a typed stock-update operation; validate every field; write atomically; verify persistence; return failure on write errors.

### H-01 — HIGH: Public CORS policy increases attack surface

**Evidence:** The API sets Access-Control-Allow-Origin: *.

**Impact:** Any website can issue browser requests to the API. CORS is not authentication, but this increases practical exposure when endpoints are reachable.

**Fix:** Restrict origin(s) or remove browser cross-origin access unless explicitly required.

### H-02 — HIGH: Gmail webhook trusts caller-supplied content

**Evidence:** POST /api/gmail-webhook accepts from, subject, date, snippet and attachmentNames and sends them to Telegram without source authentication.

**Impact:** An external caller may forge operational notifications or inject content into the Telegram channel.

**Fix:** Verify a signed webhook or use an authenticated provider endpoint; validate schema and escape output.

### H-03 — HIGH: Telegram HTML output has injection risk

**Evidence:** Several responses use parse_mode HTML and interpolate fields such as subject, sender, URLs and filenames without a complete HTML escaping layer.

**Impact:** Attacker-controlled text can alter Telegram formatting or produce confusing links/content.

**Fix:** Centralize Telegram HTML escaping and only interpolate escaped values.

### H-04 — HIGH: Sensitive file exfiltration surface

**Evidence:** File-search/download logic recursively scans business directories and AGY scratch/workspace locations, then sends matching documents back to Telegram.

**Impact:** A compromised or unauthorized chat can retrieve operational files, including spreadsheets and documents.

**Fix:** Use an explicit export directory and allowlist exact file classes/paths. Never expose the entire workspace.

### H-05 — HIGH: AI output is not a trusted data source

**Evidence:** The unified AI parser extracts operational fields and downstream logic can apply stock/yield updates based on the parsed result.

**Impact:** Prompt errors, hallucinations, adversarial text, or malformed numeric values can become durable business data.

**Fix:** Treat LLM output as untrusted extraction. Validate schema, ranges, arithmetic relationships and source provenance before writes.

### H-06 — HIGH: Ground Truth contains hardcoded records marked verified

**Evidence:** ground_truth_validator.js hardcodes AFT and Siam Yamamori records and sets verified: true. The implementation comments say raw Excel/PDF parsing.

**Impact:** The verified flag does not consistently mean “verified from the raw source file”. This invalidates a strict ground-truth claim.

**Fix:** Every record must carry provenance: source file hash, parser version, cell/page/range, extraction timestamp, and verification result.

### H-07 — HIGH: Excel parser incorrectly maps workbook sheets by position

**Evidence:** parseSheetMap() maps workbook sheet order to xl/worksheets/sheetN.xml rather than resolving workbook relationships.

**Impact:** A valid XLSX can associate a sheet name with a different worksheet XML target. The validator can read the wrong sheet.

**Fix:** Resolve r:id through xl/_rels/workbook.xml.rels and validate the target exists.

### H-08 — HIGH: Missing target sheet silently falls back to last sheet

**Evidence:** parseAndVerifySheet() selects the requested sheet or sheetMap[sheetMap.length - 1].

**Impact:** A renamed/missing Sep-26 sheet can cause a different sheet to be certified instead of failing closed.

**Fix:** Never fallback for a ground-truth validation path. Missing target = hard failure.

### H-09 — HIGH: Excel parser treats unreadable/invalid cells as absence

**Evidence:** Only positive parseable values are accumulated. Invalid/missing values can contribute zero, while totals are compared against an expected value defaulting to zero when absent.

**Impact:** Parser failure can produce a false “verified” zero or hide missing data.

**Fix:** Track cell states separately: present-valid, present-invalid, missing, formula, unsupported. Any unsupported/malformed required cell must fail validation.

### H-10 — HIGH: Idempotency uses Date.now() fallbacks

**Evidence:** Some event IDs use Date.now() when a Telegram message_id is unavailable; operation/log IDs are also time-derived.

**Impact:** Retries can become new events and duplicate business effects.

**Fix:** Require a stable source event ID. If none exists, generate and persist a deterministic hash of the source event/payload.

### H-11 — HIGH: Memory poisoning / persistent prompt injection

**Evidence:** autoLearnFromText() stores user text as learned facts, and memory is injected into GEMINI.md / AI context.

**Impact:** A malicious or simply incorrect message can become persistent instruction/fact and influence later agent behavior.

**Fix:** Separate immutable rules from learned facts; require explicit approval for business-rule changes; never treat user text as system instruction.

### H-12 — HIGH: Secrets can be stored through chat commands

**Evidence:** set_glm_key and set_hotmail write API/app passwords to local JSON configuration files.

**Impact:** Credentials sent through Telegram become durable plaintext files and may appear in logs/backups or be exposed through file retrieval.

**Fix:** Use environment/OS credential storage. Never accept long-lived secrets via ordinary chat messages.

### H-13 — HIGH: Write operations are not transactional across local/cloud stores

**Evidence:** The system writes local JSON and then separately posts to Render/Google Sheets, while sync errors are logged or swallowed.

**Impact:** Local and cloud copies can diverge with no durable reconciliation queue or transaction state.

**Fix:** Use an append-only local event ledger, durable outbox, acknowledgements, retries and reconciliation status.

### H-14 — HIGH: Concurrent JSON writes can lose updates

**Evidence:** Multiple handlers can read-modify-write team_ops_status.json and other JSON files without a lock or atomic compare-and-swap.

**Impact:** Overlapping requests can overwrite one another.

**Fix:** Serialize writes per ledger or use a transactional datastore. At minimum use temp-file + rename plus an application-level write queue.

### H-15 — HIGH: Failure is frequently converted into success

**Evidence:** Examples include empty catches, stock-update returning success after a swallowed write error, and external sync functions that do not propagate failure.

**Impact:** Operators can be told that an operation succeeded when data was not persisted or synced.

**Fix:** Define explicit states: COMMITTED, PENDING_SYNC, FAILED. Never report success before durable commit.

### H-16 — HIGH: TNS alert implementation does not match its stated schedule

**Evidence:** Alert-TNSPreparation.ps1 comments mention D-30, D-20, D-10, D-5, D-3, but targetStages is only 20,10,5,3. The script also contains a single hardcoded order.

**Impact:** D-30 is not implemented, and the alert engine is not a dynamic schedule reader despite naming suggesting a master schedule.

**Fix:** Read the actual schedule source and derive alert stages from configuration. Test each stage with deterministic dates.

### H-17 — HIGH: Operational data is duplicated across code and JSON/HTML

**Evidence:** Stock values, schedules and order quantities appear in bot.js, webhook_server.js, ground_truth_data and ops_mobile_web.html.

**Impact:** Different interfaces can display different values, creating multiple sources of truth.

**Fix:** Move operational facts to one canonical ledger; UI and bot must read the same source.

### H-18 — HIGH: Encoding corruption affects business strings and paths

**Evidence:** Large portions of the inspected source contain mojibake/garbled Thai strings and paths.

**Impact:** Exact string matching, customer/product detection, filenames and user-facing output can fail silently.

**Fix:** Normalize all source files to UTF-8, repair corrupted literals, and add tests for Thai customer/product names and paths.

### M-01 — MEDIUM: Supervisor restarts based on shallow health checks

**Evidence:** supervisor.js treats HTTP 200 /api/health as health and may kill/restart the bot process after probe failures.

**Impact:** Transient API/network conditions can cause disruptive restarts; health does not prove Telegram polling, data persistence or sync health.

**Fix:** Separate liveness/readiness and probe the actual dependencies.

### M-02 — MEDIUM: Supervisor references external scripts not included in the shared snapshot

**Evidence:** The inspected bundle references Secretary-Daemon.ps1 and other external scripts/paths that are not self-contained in the repository snapshot.

**Impact:** The published repository cannot be reproduced reliably from the published source alone.

**Fix:** Publish a complete dependency manifest and either include required scripts or explicitly document external deployment artifacts.

### M-03 — MEDIUM: No request-size limits on JSON body

**Evidence:** getBody() accumulates request data until end without a content-length/body-size guard.

**Impact:** A reachable endpoint can be abused for memory exhaustion.

**Fix:** Reject oversized requests before buffering; enforce a small body limit.

### M-04 — MEDIUM: Recursive filesystem scans are synchronous

**Evidence:** Directory traversal uses fs.readdirSync/statSync recursively.

**Impact:** Large workspaces can block the Node event loop and reduce bot responsiveness.

**Fix:** Prefer bounded async traversal or a pre-indexed registry.

### M-05 — MEDIUM: Multipart upload boundaries use Math.random()

**Evidence:** sendDocument/sendPhoto construct multipart boundaries with Math.random().

**Impact:** This is not a strong randomness source, though practical risk is low because the boundary is internal to a single request.

**Fix:** Use crypto.randomBytes() for correctness; this is a hardening item, not the primary security issue.

### M-06 — MEDIUM: Backup retention is count-based, not integrity-based

**Evidence:** Stock backups are retained by file count and daily naming.

**Impact:** Backups do not include hashes/manifest metadata and a failed backup does not block a mutation.

**Fix:** Use an append-only backup/event model with hashes and verify-after-write.

### M-07 — MEDIUM: Date/time handling mixes local time, Bangkok conversion and UTC

**Evidence:** The code constructs dates through locale conversions and UTC ISO strings in several places.

**Impact:** Boundary dates around midnight can trigger wrong operational days.

**Fix:** Use one explicit timezone strategy and test DST-independent date arithmetic (Asia/Bangkok).

### M-08 — MEDIUM: No automated security/integrity test suite is evident

**Evidence:** The supplied source bundle contains implementation but no evidence of a test suite covering auth, parser correctness, idempotency, concurrent writes or alert stages.

**Impact:** Regressions can reintroduce high-impact defects.

**Fix:** Add minimal integration tests for every critical write path and parser invariant.

## Remediation order

- Rotate/revoke exposed credentials and scrub Git history.
- Implement fixed Telegram authorization and disable privileged shell commands.
- Remove unrestricted AGY permissions.
- Authenticate and restrict every webhook write endpoint.
- Create a canonical event ledger and eliminate duplicated hardcoded facts.
- Replace the XLSX parser with relationship-aware parsing and fail-closed validation.
- Add source provenance to every Ground Truth record.
- Implement durable sync/outbox semantics.
- Gate memory learning and repair UTF-8 corruption.
- Add integration/security tests.
