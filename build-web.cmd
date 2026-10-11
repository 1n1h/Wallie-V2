@echo off
cd /d "%~dp0"
npm run build > build-web.log 2>&1
