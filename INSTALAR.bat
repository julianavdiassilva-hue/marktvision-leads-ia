@echo off
chcp 65001 >nul
title Instalacao da Marktvision Leads IA
cd /d "%~dp0"
echo.
echo  ==== Instalacao da Marktvision Leads IA ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao instalar
echo.
pause
