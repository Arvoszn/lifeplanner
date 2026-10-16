@echo off
setlocal
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3141 ^| findstr LISTENING') do (
  echo Stopping LifePlanner (PID %%a)
  taskkill /PID %%a /F
)
pause
