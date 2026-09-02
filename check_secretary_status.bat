@echo off
chcp 65001 >nul
title Check AI Secretary Status
echo ========================================================
echo   AI Secretary Status ^& Activity Log (E:\??????\agy)
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*Secretary-Daemon.ps1*' }; if ($procs) { Write-Host '>> Status: RUNNING (PID: ' ($procs.ProcessId -join ', ') ')' -ForegroundColor Green } else { Write-Host '>> Status: STOPPED' -ForegroundColor Red }; Write-Host ''; Write-Host '--- Recent Activity Log (Last 15 lines) ---' -ForegroundColor Cyan; if (Test-Path 'E:\??????\agy\secretary_activity.log') { Get-Content 'E:\??????\agy\secretary_activity.log' -Tail 15 } else { Write-Host 'No log file yet.' }"

echo.
echo ========================================================
pause
