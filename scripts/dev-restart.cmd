@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo [dev-restart] stopping...
call "%~dp0dev-stop.cmd"
echo [dev-restart] starting...
call "%~dp0dev-start.cmd"
exit /b %ERRORLEVEL%
