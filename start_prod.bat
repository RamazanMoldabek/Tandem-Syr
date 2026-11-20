@echo off
chcp 65001 >nul
title Tandem-Syr Production Server (Single Port 8001)

echo ===================================================
echo   Сборка и запуск Tandem-Syr в Production-режиме
echo ===================================================

echo [1/2] Сборка фронтенда (React + Vite -> frontend/dist) ...
cd /d D:\tandem-syr\frontend
call npm run build
if %errorlevel% neq 0 (
    echo [ОШИБКА] Сборка фронтенда завершилась с ошибкой.
    pause
    exit /b %errorlevel%
)

echo [2/2] Запуск единого сервера (UI + API) на http://0.0.0.0:8001 ...
cd /d D:\tandem-syr\stt-service
.\venv\Scripts\python.exe -m uvicorn stt_server:app --host 0.0.0.0 --port 8001
