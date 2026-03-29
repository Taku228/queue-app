@echo off
cd /d "%~dp0"

call npm run build
call npm run start -- --hostname 0.0.0.0