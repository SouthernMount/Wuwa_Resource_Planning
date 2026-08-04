@echo off
setlocal
cd /d "%~dp0"

set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo Electron runtime is missing or incomplete.
  echo Run npm install in this folder, then launch again.
  start "" "%~dp0index.html"
  pause
  exit /b 1
)

rem Electron is a GUI process. Launch it directly, then close this terminal.
start "" "%ELECTRON_EXE%" "%CD%"
exit /b 0
