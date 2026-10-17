@echo off
cd /d "%~dp0"
firebase deploy --only functions:feed > feeddeploy.log 2>&1
