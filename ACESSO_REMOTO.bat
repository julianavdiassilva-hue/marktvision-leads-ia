@echo off
chcp 65001 >nul
title Acesso pela internet
cd /d "%~dp0"
echo.
echo  ==== Acesso pela internet ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao remoto
echo.
pause
