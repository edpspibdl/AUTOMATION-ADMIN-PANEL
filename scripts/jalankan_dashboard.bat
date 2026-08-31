@echo off
title StokPoin Automation Dashboard
echo ========================================================
echo   Menjalankan StokPoin Automation Dashboard...
echo ========================================================
echo.

cd ..
start "" http://localhost:3000
node server.js
pause
