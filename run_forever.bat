@echo off
title Secretary Supervisor (Auto-Restart)
chcp 65001 >nul

echo ========================================================
echo   AI Secretary Auto-Restart Watchdog
echo   Press Ctrl+C to stop this window permanently.
echo ========================================================

:loop
echo [%time%] Starting Supervisor...
node "E:\agy\supervisor.js"
echo [%time%] Supervisor crashed or terminated. Restarting in 3 seconds...
ping 127.0.0.1 -n 4 >nul
goto loop
