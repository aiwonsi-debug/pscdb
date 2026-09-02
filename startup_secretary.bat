@echo off
chcp 65001 >nul
:: Kill existing node processes to avoid duplicates
taskkill /F /IM node.exe >nul 2>&1
wmic process where "commandline like '%%Secretary-Daemon.ps1%%' and name='powershell.exe'" call terminate >nul 2>&1
ping 127.0.0.1 -n 3 >nul

:: Start Supervisor (which starts Bot, Daemon, and SSH Server and keeps them alive)
start "" /B node "E:\agy\supervisor.js"
