@echo off
REM BiblioVault — stop backend and frontend dev servers by port
echo Stopping BiblioVault servers...
taskkill /f /fi "PID ne 0" /fi "IMAGENAME eq node.exe" 2>nul
echo Done.
