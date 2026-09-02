@echo off
REM SMA Housing System - double-click launcher for the built app.
REM Runs the Express backend, which also serves the built React frontend.
REM Uses Node.js from PATH if it is installed, otherwise looks for a portable
REM Node zip (node-v*-win-x64) unpacked next to this folder, in Downloads or on
REM the Desktop - the portable build needs no installer and no admin rights.
setlocal
cd /d "%~dp0"

set "NODE_EXE="

where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"

if not defined NODE_EXE (
  for %%R in ("%~dp0.." "%USERPROFILE%\Downloads" "%USERPROFILE%\Desktop" "%USERPROFILE%") do (
    for /d %%D in ("%%~fR\node-v*-win-x64") do (
      if exist "%%~fD\node.exe" set "NODE_EXE=%%~fD\node.exe"
    )
  )
)

if not defined NODE_EXE (
  echo Node.js was not found.
  echo.
  echo No admin rights? Download the Windows Binary ZIP from https://nodejs.org
  echo ^(Downloads page, "Windows Binary (.zip)", 64-bit^), extract it into your
  echo Downloads or Desktop folder, then run this launcher again - it finds a
  echo folder named node-v...-win-x64 in those places on its own.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0frontend\dist\index.html" (
  echo The frontend has not been built yet.
  echo Run these once, from this folder:
  echo     npm run setup
  echo     npm run build
  echo.
  pause
  exit /b 1
)

echo Using Node: %NODE_EXE%
echo Starting SMA Housing System... keep this window open.
echo Then open http://localhost:3000 in your browser.
echo.
cd backend
"%NODE_EXE%" server.js
pause
