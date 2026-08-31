@echo off
title Instalasi Dependensi StokPoin Automation
echo ========================================================
echo   Menginstal Dependensi dan Browser Playwright...
echo ========================================================
echo.

echo [1/2] Menjalankan npm install...
call npm install

echo.
echo [2/2] Memasang Browser Headless Chromium...
call npx playwright install chromium

echo.
echo ========================================================
echo   Instalasi SELESAI! Anda siap menjalankan aplikasi.
echo   Silakan klik dua kali 'jalankan_dashboard.bat'
echo ========================================================
echo.
pause
