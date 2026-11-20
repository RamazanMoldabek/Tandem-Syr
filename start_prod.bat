@echo off
chcp 65001 >nul
title Tandem-Syr Production Server + Public HTTPS Tunnel (Port 8001)

echo ===================================================================
echo   Сборка и запуск Tandem-Syr в Production-режиме (Port 8001 + HTTPS)
echo ===================================================================

echo [1/3] Сборка фронтенда (React + Vite -^> frontend/dist) ...
cd /d D:\tandem-syr\frontend
call npm run build
if %errorlevel% neq 0 (
    echo [ОШИБКА] Сборка фронтенда завершилась с ошибкой.
    pause
    exit /b %errorlevel%
)

echo [2/3] Запуск Cloudflare HTTPS-туннеля в отдельном окне ...
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    start "Tandem-Syr Public HTTPS URL (Cloudflare)" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8001"
) else (
    where cloudflared >nul 2>nul
    if %errorlevel% equ 0 (
        start "Tandem-Syr Public HTTPS URL (Cloudflare)" cmd /k "cloudflared tunnel --url http://127.0.0.1:8001"
    ) else (
        echo [ВНИМАНИЕ] cloudflared не найден, сервер будет доступен только локально: http://localhost:8001
    )
)

echo [3/3] Запуск единого сервера (UI + API: Whisper + MMS-1B + EasyOCR + KazLLM) на http://0.0.0.0:8001 ...
cd /d D:\tandem-syr\stt-service
.\venv\Scripts\python.exe -m uvicorn stt_server:app --host 0.0.0.0 --port 8001
