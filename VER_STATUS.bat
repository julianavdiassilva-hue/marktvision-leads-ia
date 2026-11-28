@echo off
chcp 65001 >nul
title Situacao dos servicos
cd /d "%~dp0"
if not exist "%~dp0infra\windows\marktvision.ps1" (
  echo.
  echo  ERRO: os arquivos do programa nao estao nesta pasta.
  echo  Isso acontece quando o arquivo e aberto DE DENTRO do ZIP.
  echo.
  echo  Como resolver:
  echo   1. Feche esta janela.
  echo   2. Clique com o botao direito no ZIP baixado e escolha "Extrair tudo..."
  echo      ou, no WinRAR, "Extrair para..." e informe C:\Marktvision
  echo   3. Abra a pasta extraida e de dois cliques no INSTALAR.bat que esta nela.
  echo.
  pause
  exit /b 1
)
echo.
echo  ==== Situacao dos servicos ====
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\windows\marktvision.ps1" -Acao status
echo.
pause
