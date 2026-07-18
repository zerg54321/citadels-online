@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

echo [generate-replay] building common + server...
pushd common
call npm.cmd run build
if errorlevel 1 exit /b 1
popd

pushd server
call npx.cmd tsc
if errorlevel 1 exit /b 1
echo [generate-replay] running offline engine...
set CITADELS_SYNC=1
set CITADELS_FAST=1
node dist/engine/replay/exampleReplay.js %*
set ERR=%ERRORLEVEL%
popd
exit /b %ERR%
