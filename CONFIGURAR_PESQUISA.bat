@echo off
chcp 65001 >nul
title Configurar pesquisa de empresas
cd /d "%~dp0"
echo.
echo  ==== Configurar pesquisa de empresas ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao pesquisa
echo.
pause
