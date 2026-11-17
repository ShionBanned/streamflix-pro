@echo off
title Detener StreamFlix
color 0C
echo ==========================================================
echo    DETENIENDO STREAMFLIX (SERVIDORES EN SEGUNDO PLANO)
echo ==========================================================
echo.
echo Cerrando servidores en puertos 4000 y 5173...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Process -Id (Get-NetTCPConnection -LocalPort 4000,5173 -State Listen -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue" >nul 2>&1
echo.
echo [OK] Servidores de StreamFlix detenidos exitosamente.
ping 127.0.0.1 -n 3 >nul
exit
