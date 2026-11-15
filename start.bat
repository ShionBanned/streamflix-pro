@echo off
title StreamFlix - Plataforma Personal de Streaming Hibrida
color 0C

echo ==========================================================
echo    STREAMFLIX - PLATAFORMA DE STREAMING HIBRIDA ($0)
echo    P2P WebTorrent + AutoEmbed Fallback + IPTV Live TV
echo ==========================================================
echo.

echo [1/2] Iniciando Servidor Backend (Puerto 4000)...
start "StreamFlix Backend" cmd /k "cd backend && npm start"

echo [2/2] Iniciando Servidor Frontend (Puerto 5173)...
start "StreamFlix Frontend" cmd /k "cd frontend && npm run dev"

timeout /t 3 >nul
echo.
echo ==========================================================
echo Todo listo! Abre en tu navegador:
echo http://localhost:5173
echo ==========================================================
start http://localhost:5173
pause
