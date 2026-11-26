@echo off
chcp 65001 >nul
title Backup da Marktvision Leads IA
cd /d "%~dp0"
echo.
echo  ==== Backup da Marktvision Leads IA ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao backup
echo.
pause
