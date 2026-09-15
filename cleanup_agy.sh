#!/bin/bash
# cleanup_agy.sh — run from inside the project root (agy/)
# Removes junk that bloats the repo and inflates AI/token cost.
set -e

echo "== Removing Drive sync junk =="
rm -rf .tmp.driveupload

echo "== Removing nested/duplicate zip archives =="
rm -rf archive/nested_zips

echo "== Removing full-source-dump audit file (huge token cost) =="
rm -f docs/ALL_SOURCE_CODE_FOR_AUDIT.txt

echo "== Removing one-off patch scripts (already applied, no longer needed) =="
rm -rf archive/patch_scripts

echo "== Removing desktop.ini litter (Windows/Drive metadata) =="
find . -type f -name "desktop.ini" -delete

echo "== Done. Review 'git status' before committing. =="
echo "REMINDER: rotate psc_api_key.txt, groq_api_key.txt, ssh_host_key.pem,"
echo "LINE_config.json, line_config.json, gmail_config.json, hotmail_config.json"
echo "— these were found sitting in the folder and should be treated as leaked."
