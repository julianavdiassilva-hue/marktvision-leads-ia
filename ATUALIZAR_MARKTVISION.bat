@echo off
chcp 65001 >nul
title Atualizacao da Marktvision Leads IA
cd /d "%~dp0"
echo.
echo  ==== Atualizacao da Marktvision Leads IA ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao atualizar
echo.
pause
