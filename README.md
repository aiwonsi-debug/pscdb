# PSC Operations Dashboard & Production Engine (pscdb)

Production backend and field operations dashboard for **บจก.ไพศาลเจริญ (1988)**.

---

## 🏗️ Dual-Tier Architecture & Ingress Layout

```text
                    INTERNET
                       │
                       ▼
              Render / HTTPS
          (https://pscdb.onrender.com)
                       │
                       ▼
          render-dashboard/server.js
              [PUBLIC INGRESS]
                       │
                       ▼
                public/ops.html
              (/css/ops.css, /js/ops.js)
                       │
                       ▼
                 Runtime APIs
              ┌────────┴────────┐
              ▼                 ▼
        Business Logic      Runtime State


LOCAL MACHINE / HOST
     │
     ▼
   bot.js (Telegram Secretary Watcher Daemon)
     │
     ▼
webhook_server.js [LOCAL GATEWAY]
     │
     ├── Local API (Port 8080)
     ├── Local hooks & notifications
     └── Background mail/PO integration
```

---

## 📁 Repository Layout

```text
pscdb/
├── render-dashboard/                   # Production Render Container
│   ├── server.js                       # Public Ingress & Route Controller
│   ├── package.json                    # Container deployment config (start: node server.js)
│   ├── memory_engine.js                # Core memory & anti-hallucination engine
│   ├── ai_quota_tracker.js             # Quota tracker & usage monitor
│   ├── line_notifier.js                # LINE messaging dispatcher
│   └── public/                         # Decomposed web assets served on Render
│       ├── ops.html                    # Field Operations UI
│       ├── css/ops.css                 # Theme & Stylesheet
│       └── js/ops.js                   # Client state & DOM interactions
│
├── public/                             # Local Clean Presentation Layer
│   ├── ops.html                        # Field Operations UI
│   ├── css/ops.css                     # Operations Dashboard Theme & Stylesheet
│   └── js/ops.js                       # Client state & DOM interactions
│
├── bot.js                              # Telegram Secretary Watcher Daemon
├── webhook_server.js                   # Local API Gateway & Integration Server
├── business_logic.js                   # Core calculation & business rules
├── memory_engine.js                    # Structured operational facts & memory
├── excel_integrity_engine.js           # Closed-loop Excel parsing engine
├── po_detail_formatter.js              # Multi-customer PO summary parser
├── ai_quota_tracker.js                 # Local telemetry tracker
├── line_notifier.js                    # Local LINE notifier
├── Fetch-GmailPO.ps1                   # Smart Gmail PO Fetcher
├── Fetch-HotmailPO.ps1                 # Smart Hotmail PO Fetcher
├── Secretary-Daemon.ps1                # Background polling daemon
├── Auto-PrepareGT.js                   # Ground Truth delivery preparation
├── Alert-TNSPreparation.js             # Advance crop alert engine
│
├── data/                               # Schema & State Templates
│   └── examples/
│       ├── orders.json.example         # Example schema for team order cards
│       └── stock.json.example          # Example schema for live stock inventory
│
└── tests/                              # Verification & Security Test Suites
    ├── security_remediation.test.js    # Static security & RBAC verification
    └── live_http_audit.test.js         # Live HTTP negative-test audit suite
```

---

## 🔒 Production Ingress Rules & State Management

* **Single Public Ingress:** Only Render (`https://pscdb.onrender.com` -> `render-dashboard/server.js`) faces the Internet.
* **Zero Secondary Ingress:** No tunnels, no Cloudflare dependencies, no public open ports on local host.
* **Separation of Concerns:** Deep forensic audit logs and exploratory scripts are maintained externally in [`aiwonsi-debug/agy-audit-share`](https://github.com/aiwonsi-debug/agy-audit-share).
* **State Decoupling:** Dynamic operational state files (`*.json`, `*.log`, `*.md`) are persisted locally/dynamically at runtime and excluded from Git commits to ensure clean, reproducible builds.

---

## 🧪 Verification & Testing

To run the full suite of security and runtime contract tests:

```bash
# Security & RBAC verification (15/15 PASS)
node tests/security_remediation.test.js

# Live HTTP contract & Negative audit suite (32/32 PASS)
node tests/live_http_audit.test.js
```
