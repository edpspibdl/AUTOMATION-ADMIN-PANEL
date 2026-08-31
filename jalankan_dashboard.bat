@echo off
title StokPoin Automation Dashboard
echo ========================================================
echo   Menjalankan StokPoin Automation Dashboard...
echo ========================================================
echo.

start "" http://localhost:3000
node server.js
pause
