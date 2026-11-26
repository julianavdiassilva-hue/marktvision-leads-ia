@echo off
chcp 65001 >nul
title Inicio automatico com o Windows
cd /d "%~dp0"
echo.
echo  ==== Inicio automatico com o Windows ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao autoinicio
echo.
pause
