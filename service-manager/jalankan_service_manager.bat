@echo off
title Service Manager Dashboard
echo ========================================================
echo   Menjalankan Service Manager Dashboard (Port 4000)...
echo ========================================================
echo.

cd /d "%~dp0"
start "" http://localhost:4000
node server.js
pause
