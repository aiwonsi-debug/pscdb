@echo off
chcp 65001 >nul
title Gmail PO Sync & GT Generator
echo ========================================================
echo   Manual Sync: Gmail PO Downloader & GT Schedule
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "E:\??????\agy\Fetch-GmailPO.ps1" -AutoProcessGT

echo.
echo ========================================================
echo   Finished! Press any key to exit...
echo ========================================================
pause >nul
