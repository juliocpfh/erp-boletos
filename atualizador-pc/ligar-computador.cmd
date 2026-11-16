@echo off
rem Liga este computador ao sistema: abre no navegador uma pagina (so deste computador) que pede o e-mail e a senha do sistema
rem e a pasta do backup seguro. A senha nao fica guardada: o computador recebe um cracha que so le, cifrado pelo Windows.
rem Rode com dois cliques. Para desligar: no sistema, Usuarios -> Aparelhos ligados -> Desligar.
setlocal
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org e rode de novo. & pause & exit /b 1)
node "%~dp0atualizador.mjs" --ligar
pause
