@echo off
setlocal EnableExtensions

REM Restart the dev stack with AI thinking stream enabled (AI_DEBUG=1).
call "%~dp0dev-stop.cmd"
if errorlevel 1 exit /b 1
call "%~dp0dev-start.cmd" ai
exit /b %ERRORLEVEL%
