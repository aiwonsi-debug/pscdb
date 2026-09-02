@echo off
chcp 65001 >nul
title AI Secretary Service
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process 'C:\Users\624\tools\nodejs\node.exe' -ArgumentList 'E:\??????\agy\supervisor.js' -WindowStyle Hidden"
