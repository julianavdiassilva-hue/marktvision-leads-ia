@echo off
chcp 65001 >nul
title Criar ou redefinir o administrador geral
cd /d "%~dp0"
echo.
echo  ==== Criar ou redefinir o administrador geral ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao admin
echo.
pause
