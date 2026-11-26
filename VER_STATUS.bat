@echo off
chcp 65001 >nul
title Situacao dos servicos
cd /d "%~dp0"
echo.
echo  ==== Situacao dos servicos ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao status
echo.
pause
