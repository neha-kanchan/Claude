@echo off
REM SMA Housing System - double-click launcher (requires Node.js 24+ on PATH)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo If you use the portable Node zip, either add its folder to PATH or edit the
  echo line below to point at your node.exe, for example:
  echo    "C:\Users\YOURNAME\Downloads\node-v24.20.0-win-x64\node.exe" server.js
  pause
  exit /b 1
)
echo Starting SMA Housing System... keep this window open.
node server.js
pause
