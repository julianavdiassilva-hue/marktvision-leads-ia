@echo off
chcp 65001 >nul
title Iniciando a Marktvision Leads IA
cd /d "%~dp0"
echo.
echo  ==== Iniciando a Marktvision Leads IA ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao iniciar
if "%1"=="auto" exit /b
echo.
pause
