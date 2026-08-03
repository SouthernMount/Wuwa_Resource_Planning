@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 鸣潮资源规划启动器

where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，无法启动源码桌面版。
  echo 已为你打开网页备用模式；自动捕捉和游戏浮窗仅在桌面版中可用。
  start "" "%~dp0index.html"
  pause
  exit /b 1
)

if not exist "node_modules\.bin\electron.cmd" (
  echo 未检测到 Electron 依赖。
  echo 如需源码桌面版，请先在当前目录运行：npm install
  echo 已为你打开网页备用模式；自动捕捉和游戏浮窗不可用。
  start "" "%~dp0index.html"
  pause
  exit /b 1
)

node -e "require('electron')" >nul 2>nul
if errorlevel 1 (
  echo Electron 二进制未安装完整，桌面版无法启动。
  echo 可尝试运行：
  echo   npm rebuild electron
  echo 若网络下载失败，可临时使用：
  echo   set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  echo   npx install-electron --no
  pause
  exit /b 1
)

call npm start
if errorlevel 1 (
  echo.
  echo 桌面版启动失败，请查看上方错误信息。
  pause
  exit /b 1
)
