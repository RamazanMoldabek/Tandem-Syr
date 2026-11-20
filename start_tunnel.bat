@echo off
chcp 65001 >nul
title Tandem-Syr Cloudflare HTTPS Tunnel (Port 8001)

echo ===================================================================
echo   Публичный HTTPS-туннель для Tandem-Syr (http://127.0.0.1:8001)
echo   Скопируйте ссылку вида https://xxxx-yyyy.trycloudflare.com ниже
echo ===================================================================

if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8001
) else (
    cloudflared tunnel --url http://127.0.0.1:8001
)
pause
