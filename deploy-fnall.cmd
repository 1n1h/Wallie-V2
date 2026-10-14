@echo off
cd /d %~dp0
firebase deploy --only functions > fnall.log 2>&1
