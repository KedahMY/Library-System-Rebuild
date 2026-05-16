@echo off
REM BiblioVault — start both backend and frontend dev servers
echo Starting BiblioVault backend (port 8000) and frontend (port 3000)...
start "BiblioVault Backend" cmd /c "cd /d %~dp0backend && npm start"
start "BiblioVault Frontend" cmd /c "cd /d %~dp0frontend && npm run dev"
echo Servers launching in separate windows.
