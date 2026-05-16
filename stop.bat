@echo off
echo Stopping BiblioVault...
taskkill /FI "WINDOWTITLE eq BiblioVault Backend*" /T /F 2>nul
taskkill /FI "WINDOWTITLE eq BiblioVault Frontend*" /T /F 2>nul
taskkill /F /IM node.exe 2>nul
echo Stopped.
