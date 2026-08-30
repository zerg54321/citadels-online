@echo off
setlocal EnableExtensions

REM Dedicated entry: start the dev stack with AI thinking stream enabled.
REM Equivalent to `scripts\dev-start.cmd ai` — the server runs with AI_DEBUG=1
REM and broadcasts 'ai-explain' events; open the game on the Vite dev port
REM (3010) and use the "AI" floating button (DevAiPanel) to watch the AI's
REM real-time decision analysis while playing.
call "%~dp0dev-start.cmd" ai
exit /b %ERRORLEVEL%
