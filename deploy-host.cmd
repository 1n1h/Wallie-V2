@echo off
cd /d "%~dp0"
firebase deploy --only hosting > deploy-host.log 2>&1
