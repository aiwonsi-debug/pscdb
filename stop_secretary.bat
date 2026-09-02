@echo off
chcp 65001 >nul
title Stop AI Secretary
echo ========================================================
echo   Stopping AI Secretary Background Services...
echo ========================================================
echo.

:: 1. Kill the run_forever.bat hidden loop
wmic process where "name='cmd.exe' and commandline like '%%run_forever.bat%%'" call terminate >nul 2>&1

:: 2. Kill all Node.js services (Supervisor, Bot, SSH Server)
taskkill /F /IM node.exe >nul 2>&1

:: 3. Kill the PowerShell Daemon
wmic process where "name='powershell.exe' and commandline like '%%Secretary-Daemon.ps1%%'" call terminate >nul 2>&1

echo.
echo [DONE] All AI Secretary background services have been stopped!
echo.
pause
