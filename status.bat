@echo off
curl -fsS http://localhost:8000/api/health >nul 2>&1 && echo Backend :8000 - RUNNING || echo Backend :8000 - NOT RUNNING
curl -fsS http://localhost:3000 >nul 2>&1 && echo Frontend :3000 - RUNNING || echo Frontend :3000 - NOT RUNNING
