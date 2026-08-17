@echo off
REM Start conda mirror checker. Double-click to run; runs in a minimized background window.
cd /d "%~dp0"
if not exist server.js (
  echo ERROR: server.js not found in %~dp0
  pause
  exit /b 1
)
start "" /min node server.js
echo conda-mirror-checker starting... open http://localhost:6688
timeout /t 2 >nul
