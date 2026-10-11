@echo off
cd /d %~dp0
call firebase deploy --only functions:chat --project wallie-ai-37522 > fndeploy.log 2>&1
