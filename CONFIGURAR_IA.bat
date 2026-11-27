@echo off
chcp 65001 >nul
title Configurar inteligencia artificial
cd /d "%~dp0"
echo.
echo  ==== Configurar inteligencia artificial ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao ia
echo.
pause
