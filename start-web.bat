@echo off
title RoleInHelp & Op65 Web Server
color 0B
echo ========================================================
echo       RoleInHelp with Op65 Academic Engine
echo     Created by: Livelyhood Tonggo Tua Sinaga
echo ========================================================
echo.
echo Menjalankan Op65 Academic Engine API Server...
echo Buka di browser: http://localhost:3065 atau file roleinhelp.html
echo.
start "" "http://localhost:3065"
node src/apiServer.js
pause
