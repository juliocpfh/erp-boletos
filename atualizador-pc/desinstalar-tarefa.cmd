@echo off
rem Remove as tarefas criadas por instalar-tarefa.cmd.
schtasks /Delete /F /TN "Imoveis - atualizador da versao PC"
schtasks /Delete /F /TN "Imoveis - atualizador da versao PC (ao entrar)"
pause
