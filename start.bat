@echo off
REM Start conda mirror checker (FOREGROUND). Double-click to run; the window stays open
REM so you can see live logs and startup errors directly. Press Ctrl+C to stop.
cd /d "%~dp0"
if not exist server.js (
  echo ERROR: server.js not found in %~dp0
  pause
  exit /b 1
)
if not exist logs mkdir logs
echo Starting conda-mirror-checker ...
echo   open http://localhost:6688
echo   (foreground: logs and errors print below; press Ctrl+C to stop)
echo.
node server.js
if errorlevel 1 (
  echo.
  echo [start.bat] node exited with error code %errorlevel%. See messages above.
  pause
)
