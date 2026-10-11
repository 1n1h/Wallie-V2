@echo off  
cd /d "C:\Users\13057\Desktop\ALL WALLIE\Wallie\web"  
call npm run dev -- --host 0.0.0.0 --port 5173 > vite-dev.log 2>&1 
