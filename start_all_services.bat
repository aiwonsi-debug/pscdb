@echo off
chcp 65001 >nul
title Start All AI Secretary Services
echo ========================================================
echo   Starting AI Secretary Daemon & Telegram Bot
echo   Location: E:\??????\agy
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process 'C:\Users\624\tools\nodejs\node.exe' -ArgumentList 'E:\??????\agy\bot.js' -WindowStyle Hidden"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"E:\??????\agy\Secretary-Daemon.ps1\"' -WindowStyle Hidden"

echo [SUCCESS] ???????? AI ??? Telegram Bot ?????????????????????????????????!
echo.
timeout /t 3 >nul
