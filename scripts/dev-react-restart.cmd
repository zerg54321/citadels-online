@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo [dev-react-restart] stopping...
call "%~dp0dev-react-stop.cmd"
echo [dev-react-restart] starting...
call "%~dp0dev-react-start.cmd"
exit /b %ERRORLEVEL%
