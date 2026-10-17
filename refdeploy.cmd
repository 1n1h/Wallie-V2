@echo off
cd /d "%~dp0"
firebase deploy --only functions:claimReferral > refdeploy.log 2>&1
