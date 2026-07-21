@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "ROOT=%CD%"
set "PID_DIR=%ROOT%\.dev-pids"
set "LOG_DIR=%ROOT%\.dev-logs"
set "SERVER_PORT=8081"
set "REACT_PORT=3001"

if not exist "%PID_DIR%" mkdir "%PID_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [dev-react-start] root: %ROOT%

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [dev-react-start] ERROR: npm.cmd not found in PATH
  exit /b 1
)

if not exist "%ROOT%\client-react\node_modules" (
  echo [dev-react-start] ERROR: client-react\node_modules not found
  echo [dev-react-start] run: cd client-react ^&^& npm install
  exit /b 1
)

if exist "%PID_DIR%\client-react.pid" (
  echo [dev-react-start] client-react pid file exists - run scripts\dev-react-stop.cmd first
  exit /b 1
)

REM Warn (do not fail) if server is not listening — the React UI scaffold can
REM still be inspected without a backend, only socket game features need it.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "if (-not (Get-NetTCPConnection -LocalPort %SERVER_PORT% -State Listen -ErrorAction SilentlyContinue)) { Write-Host '[dev-react-start] WARNING: server not listening on %SERVER_PORT% — run scripts\dev-start.cmd for full game features' }"

echo [dev-react-start] starting client-react on port %REACT_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','%REACT_PORT%' -WorkingDirectory '%ROOT%\client-react' -RedirectStandardOutput '%LOG_DIR%\client-react.out.log' -RedirectStandardError '%LOG_DIR%\client-react.err.log' -PassThru -WindowStyle Hidden; Set-Content -Path '%PID_DIR%\client-react.pid' -Value $p.Id -Encoding ascii; Write-Host ('[dev-react-start] client-react pid ' + $p.Id)"
if errorlevel 1 (
  echo [dev-react-start] ERROR: failed to start client-react
  exit /b 1
)

echo.
echo [dev-react-start] ready
echo   react:    http://127.0.0.1:%REACT_PORT%/
echo   vue:      http://127.0.0.1:3000/   (if scripts\dev-start.cmd is running)
echo   backend:  http://127.0.0.1:%SERVER_PORT%/ (shared with vue client)
echo   logs:     %LOG_DIR%\client-react.{out,err}.log
echo   stop:     scripts\dev-react-stop.cmd
exit /b 0
