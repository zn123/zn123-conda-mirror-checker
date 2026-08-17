@echo off
REM Stop conda mirror checker by killing the process listening on PORT.
set PORT=6688
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /c:":%PORT% " ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
  if not errorlevel 1 (
    echo Stopped PID %%a
    set FOUND=1
  )
)
if %FOUND%==0 echo No running server found on port %PORT%.
