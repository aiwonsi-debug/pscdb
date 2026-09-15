#!/bin/bash
# sync_render_dashboard.sh — run from project root before every deploy.
# Root files are the source of truth; render-dashboard/ is the deploy copy.
set -e

# รูปแบบ "src" (ชื่อเดียวกันทั้ง root และ render-dashboard) หรือ "src:dest" (ชื่อต่างกัน)
FILES=(
  "line_notifier.js"
  "memory_engine.js"
  "webhook_server.js:server.js"
  "cabbage_prices_transport.json"
  "stock_inventory.json"
  "team_ops_status.json"
  "secretary_memory.json"
)

echo "== Checking for drift before overwrite =="
for entry in "${FILES[@]}"; do
  src="${entry%%:*}"
  dest="${entry#*:}"   # ถ้าไม่มี ":" dest จะเท่ากับ src เอง
  if [ -f "render-dashboard/$dest" ] && [ -f "$src" ]; then
    if ! diff -q "$src" "render-dashboard/$dest" > /dev/null 2>&1; then
      echo "  DIFF: $src -> render-dashboard/$dest  (render-dashboard copy will be overwritten by root copy)"
    fi
  fi
done

echo "== Syncing root -> render-dashboard =="
for entry in "${FILES[@]}"; do
  src="${entry%%:*}"
  dest="${entry#*:}"
  if [ -f "$src" ]; then
    cp "$src" "render-dashboard/$dest"
    echo "  synced $src -> render-dashboard/$dest"
  fi
done

echo "== Done. render-dashboard/ now matches root. Commit + deploy. =="
