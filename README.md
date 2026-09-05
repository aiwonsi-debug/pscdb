# PSC Operations Dashboard & Production Engine (pscdb)

Production backend and field operations dashboard for **บจก.ไพศาลเจริญ (1988)**.

---

## 🏗️ Repository Architecture

```text
pscdb/
├── webhook_server.js           # Production HTTP Server & API Ingress
├── bot.js                      # Telegram Secretary Watcher Daemon
├── business_logic.js           # Core calculation & business rules
├── memory_engine.js            # Structured operational facts & memory
├── excel_integrity_engine.js   # Closed-loop Excel parsing engine
│
├── public/                     # Clean Frontend Presentation Layer
│   ├── ops.html                # Field Operations UI (HTML semantic structure)
│   ├── css/
│   │   └── ops.css             # Operations Dashboard Theme & Stylesheet
│   └── js/
│       └── ops.js              # Client state, API sync & DOM interactions
│
├── data/                       # Operational State & Schemas
│   └── examples/
│       ├── orders.json.example # Example schema for team order cards state
│       └── stock.json.example  # Example schema for live stock inventory
│
├── render-dashboard/           # Render Production Deployment Container
│   ├── server.js               # Container Ingress & Route Controller
│   ├── webhook_server.js       # Core API Endpoint logic
│   └── public/                 # Static assets for production container
│
└── tests/                      # Verification & Security Test Suites
    ├── security_remediation.test.js # Static security & RBAC verification
    └── live_http_audit.test.js      # Live HTTP negative-test audit suite
```

---

## 🌐 Production Ingress & Architecture Rules

```text
Internet
   ↓
Render (https://pscdb.onrender.com)
   ↓
pscdb (Node.js HTTP Server)
   ├── Web UI (HttpOnly Session Cookie • Team Code: 9624)
   └── Write APIs (X-PSC-API-KEY / Session Cookie Gate)
```

* **Zero Secondary Ingress:** No tunnels, no Cloudflare dependencies, no public open ports.
* **Separation of Concerns:** Deep forensic audit logs and exploratory scripts are maintained externally in [`aiwonsi-debug/agy-audit-share`](https://github.com/aiwonsi-debug/agy-audit-share).

---

## 🧪 Verification & Testing

To run the full suite of security and runtime contract tests:

```bash
# Security & RBAC verification (15/15 PASS)
node tests/security_remediation.test.js

# Live HTTP contract & Negative audit suite (32/32 PASS)
node tests/live_http_audit.test.js
```
