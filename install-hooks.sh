#!/bin/sh
# Run this once after unzipping: sh install-hooks.sh
# Installs a pre-commit hook that auto-mirrors public/ into the Render
# deploy folder, replacing the manual Copy-Item step you've been doing by hand.

HOOK=".git/hooks/pre-commit"

cat > "$HOOK" << 'EOF'
#!/bin/sh
SRC="public"
DEST="archive/render-dashboard/public"

if [ -d "$SRC" ] && [ -d "$DEST" ]; then
    cp -r "$SRC"/* "$DEST"/ 2>/dev/null
    git add "$DEST"
fi
EOF
chmod +x "$HOOK"
echo "Installed: every commit now auto-syncs public/ -> archive/render-dashboard/public/"
