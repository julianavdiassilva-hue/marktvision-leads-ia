@echo off
chcp 65001 >nul
title Parando a Marktvision Leads IA
cd /d "%~dp0"
echo.
echo  ==== Parando a Marktvision Leads IA ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao parar
echo.
pause
