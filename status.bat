@echo off
REM BiblioVault — check which servers are running
echo Checking BiblioVault server status...
netstat -ano | findstr ":8000 "
if %errorlevel% equ 0 (
    echo Backend (port 8000): RUNNING
) else (
    echo Backend (port 8000): STOPPED
)
netstat -ano | findstr ":3000 "
if %errorlevel% equ 0 (
    echo Frontend (port 3000): RUNNING
) else (
    echo Frontend (port 3000): STOPPED
)
