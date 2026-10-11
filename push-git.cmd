@echo off
cd /d "%~dp0"
git push -u origin main > push-task.log 2>&1
