@echo off
chcp 65001 >nul
title Restauracao de backup
cd /d "%~dp0"
echo.
echo  ==== Restauracao de backup ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao restaurar
echo.
pause
