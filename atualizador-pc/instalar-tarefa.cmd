@echo off
rem Cria no Agendador de Tarefas do Windows a atualizacao da versao PC: todo dia as 20h e sempre que voce entrar no Windows.
rem Rode com dois cliques (uma vez). Para desfazer: desinstalar-tarefa.cmd.
setlocal
set PASTA=%~dp0
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org e rode de novo. & pause & exit /b 1)
schtasks /Create /F /SC DAILY /ST 20:00 /TN "Imoveis - atualizador da versao PC" /TR "\"node\" \"%PASTA%atualizador.mjs\""
schtasks /Create /F /SC ONLOGON /DELAY 0002:00 /TN "Imoveis - atualizador da versao PC (ao entrar)" /TR "\"node\" \"%PASTA%atualizador.mjs\""
echo.
echo Tarefas criadas. Testando agora...
node "%PASTA%atualizador.mjs"
pause
