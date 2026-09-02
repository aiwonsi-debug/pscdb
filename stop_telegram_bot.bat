@echo off
chcp 65001 >nul
title Stop Telegram Bot
echo ========================================================
echo   Stopping Telegram Bot...
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bot.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Stopped Bot Process ID:' $_.ProcessId }"

echo.
echo [DONE] ??????????? Telegram Bot ?????????????????
echo.
pause
