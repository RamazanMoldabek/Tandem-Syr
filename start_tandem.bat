@echo off
chcp 65001 >nul
title Tandem-Syr Launcher

echo ===================================================
echo   Запуск комплекса Tandem-Syr (STT + KazLLM + UI)
echo ===================================================

echo [1/2] Запуск бэкенда stt-service на http://localhost:8001 ...
start "Tandem-Syr Backend (port 8001)" cmd /k "cd /d D:\tandem-syr\stt-service && .\venv\Scripts\python.exe -m uvicorn stt_server:app --host 0.0.0.0 --port 8001 --reload"

echo [2/2] Запуск фронтенда Vite на http://localhost:5173 ...
start "Tandem-Syr Frontend (port 5173)" cmd /k "cd /d D:\tandem-syr\frontend && npm run dev"

echo Готово! Оба сервиса запущены в отдельных окнах.
