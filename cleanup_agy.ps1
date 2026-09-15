# cleanup_agy.ps1 — PowerShell equivalent of cleanup_agy.sh
Write-Host "== Removing Drive sync junk ==" -ForegroundColor Cyan
Remove-Item -Path ".tmp.driveupload", ".tmp.drivedownload" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "== Removing nested/duplicate zip archives ==" -ForegroundColor Cyan
Remove-Item -Path "archive\nested_zips", "*.zip" -Force -ErrorAction SilentlyContinue

Write-Host "== Removing full-source-dump audit file ==" -ForegroundColor Cyan
Remove-Item -Path "docs\ALL_SOURCE_CODE_FOR_AUDIT.txt" -Force -ErrorAction SilentlyContinue

Write-Host "== Removing one-off patch scripts ==" -ForegroundColor Cyan
Remove-Item -Path "archive\patch_scripts" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "== Removing desktop.ini files ==" -ForegroundColor Cyan
Get-ChildItem -Path . -Filter "desktop.ini" -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "== Done. Cleanup completed successfully. ==" -ForegroundColor Green
