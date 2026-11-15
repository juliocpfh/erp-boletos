@echo off
rem Remove as tarefas criadas por instalar-tarefa.cmd.
schtasks /Delete /F /TN "Imoveis - atualizador da versao PC"
schtasks /Delete /F /TN "Imoveis - atualizador da versao PC (ao entrar)"
schtasks /Delete /F /TN "Imoveis - copia dos arquivos (de hora em hora)"
pause
