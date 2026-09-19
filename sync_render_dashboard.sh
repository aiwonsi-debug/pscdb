#!/bin/bash
# Check or explicitly synchronize the Render deployment copy.
# Usage:
#   ./sync_render_dashboard.sh          # check only; fails on drift
#   ./sync_render_dashboard.sh --apply  # copy root canonical files to Render
set -euo pipefail

APPLY=false
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: $0 [--apply]" >&2
  exit 2
fi

FILES=(
  "line_notifier.js"
  "memory_engine.js"
  "cabbage_prices_transport.json"
  "stock_inventory.json"
  "team_ops_status.json"
)

has_drift=false
for entry in "${FILES[@]}"; do
  src="${entry%%:*}"
  dest="${entry#*:}"
  if [[ ! -f "$src" || ! -f "render-dashboard/$dest" ]]; then
    echo "MISSING: $src or render-dashboard/$dest" >&2
    has_drift=true
  elif ! cmp -s "$src" "render-dashboard/$dest"; then
    echo "DIFF: $src -> render-dashboard/$dest"
    has_drift=true
  else
    echo "OK:   $src -> render-dashboard/$dest"
  fi
done

if [[ "$has_drift" == true && "$APPLY" == false ]]; then
  echo
  echo "Drift detected. Review the diff, then rerun with --apply only if root is canonical."
  exit 1
fi

if [[ "$APPLY" == true ]]; then
  for entry in "${FILES[@]}"; do
    src="${entry%%:*}"
    dest="${entry#*:}"
    if [[ -f "$src" ]]; then
      cp "$src" "render-dashboard/$dest"
      echo "SYNCED: $src -> render-dashboard/$dest"
    fi
  done
  echo "Render copy synchronized from the reviewed root source."
fi
