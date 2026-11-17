@echo off
title StreamFlix - Plataforma Personal de Streaming Hibrida
color 0A

echo ==========================================================
echo    STREAMFLIX - PLATAFORMA DE STREAMING HIBRIDA ($0)
echo    P2P WebTorrent + AutoEmbed Fallback + IPTV Live TV
echo ==========================================================
echo.

echo [1/3] Limpiando procesos previos en puertos 4000 y 5173...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 4000,5173 -State Listen -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue" >nul 2>&1

echo [2/3] Iniciando Servidores en segundo plano (sin ventanas cmd)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c npm start' -WorkingDirectory '%~dp0backend' -WindowStyle Hidden; Start-Process cmd -ArgumentList '/c npm run dev' -WorkingDirectory '%~dp0frontend' -WindowStyle Hidden"

echo [3/3] Esperando que la aplicacion este lista...
ping 127.0.0.1 -n 4 >nul

echo.
echo ==========================================================
echo [OK] Servidores activos en segundo plano.
echo [OK] Abriendo navegador en http://localhost:5173 ...
echo ==========================================================
start http://localhost:5173
echo.
echo Para detener los servidores cuando termines, ejecuta: detener.bat
echo.
ping 127.0.0.1 -n 3 >nul
exit
