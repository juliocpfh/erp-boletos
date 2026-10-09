@echo off
chcp 65001 >nul
title Administracao de Imoveis
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo Primeira execucao: preparando o programa, aguarde...
    where py >nul 2>nul && (py -3 -m venv .venv) || (python -m venv .venv)
    if not exist ".venv\Scripts\python.exe" (
        echo.
        echo Python nao encontrado. Instale o Python 3 em https://www.python.org/downloads/
        echo e marque a opcao "Add python.exe to PATH" durante a instalacao.
        pause
        exit /b 1
    )
    ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

".venv\Scripts\python.exe" run.py %*
pause
