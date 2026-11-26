@echo off
chcp 65001 >nul
title Reiniciando a Marktvision Leads IA
cd /d "%~dp0"
echo.
echo  ==== Reiniciando a Marktvision Leads IA ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao reiniciar
echo.
pause
