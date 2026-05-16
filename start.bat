@echo off
echo Starting BiblioVault...
start "BiblioVault Backend" cmd /c "cd /d %~dp0backend && npm start"
timeout /t 3 /nobreak >nul
start "BiblioVault Frontend" cmd /c "cd /d %~dp0frontend && npm run dev"
echo Backend starting on http://localhost:8000
echo Frontend starting on http://localhost:3000
