@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "ROOT=%CD%"
set "PID_DIR=%ROOT%\.dev-pids"
set "LOG_DIR=%ROOT%\.dev-logs"
set "SERVER_PORT=8081"
set "REACT_PORT=3010"

if not exist "%PID_DIR%" mkdir "%PID_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [dev-start] root: %ROOT%

where node >nul 2>&1
if errorlevel 1 (
  echo [dev-start] ERROR: node not found in PATH
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [dev-start] ERROR: npm.cmd not found in PATH
  exit /b 1
)

if not exist "%ROOT%\client-react\node_modules" (
  echo [dev-start] ERROR: client-react\node_modules not found
  echo [dev-start] run: cd client-react ^&^& npm install
  exit /b 1
)

if exist "%PID_DIR%\server.pid" (
  echo [dev-start] server pid file exists - run scripts\dev-stop.cmd first
  exit /b 1
)
if exist "%PID_DIR%\client-react.pid" (
  echo [dev-start] client-react pid file exists - run scripts\dev-stop.cmd first
  exit /b 1
)

echo [dev-start] building common...
pushd "%ROOT%\common"
call npm.cmd run build
if errorlevel 1 (
  popd
  echo [dev-start] ERROR: common build failed
  exit /b 1
)
popd

echo [dev-start] building server...
pushd "%ROOT%\server"
call npx.cmd tsc
if errorlevel 1 (
  popd
  echo [dev-start] ERROR: server build failed
  exit /b 1
)
popd

echo [dev-start] starting server on port %SERVER_PORT%...
REM CITADELS_FAST=1 shortens phase timers (handy for sim-6p); remove for human-paced play
REM ADMIN_TOKEN / ADMIN_ALLOW_IPS enable the local /admin console. This is a
REM fixed dev-only token (the IP allowlist restricts access to loopback, so it
REM is safe to ship in the dev script). Replace with a random token in prod.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$env:CITADELS_FAST='1'; $env:ADMIN_TOKEN='dev-only-admin-token-0123456789abcdef0123456789abcdef0123456789abcdef'; $env:ADMIN_ALLOW_IPS='127.0.0.1,::1'; $p = Start-Process -FilePath 'node' -ArgumentList 'dist/index.js' -WorkingDirectory '%ROOT%\server' -RedirectStandardOutput '%LOG_DIR%\server.out.log' -RedirectStandardError '%LOG_DIR%\server.err.log' -PassThru -WindowStyle Hidden; Set-Content -Path '%PID_DIR%\server.pid' -Value $p.Id -Encoding ascii; Write-Host ('[dev-start] server pid ' + $p.Id + ' CITADELS_FAST=1')"
if errorlevel 1 (
  echo [dev-start] ERROR: failed to start server
  exit /b 1
)

echo [dev-start] starting client-react on port %REACT_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--host','0.0.0.0','--port','%REACT_PORT%' -WorkingDirectory '%ROOT%\client-react' -RedirectStandardOutput '%LOG_DIR%\client-react.out.log' -RedirectStandardError '%LOG_DIR%\client-react.err.log' -PassThru -WindowStyle Hidden; Set-Content -Path '%PID_DIR%\client-react.pid' -Value $p.Id -Encoding ascii; Write-Host ('[dev-start] client-react pid ' + $p.Id)"
if errorlevel 1 (
  echo [dev-start] ERROR: failed to start client-react - stopping server
  call "%~dp0dev-stop.cmd"
  exit /b 1
)

echo.
echo [dev-start] ready
echo   frontend: http://127.0.0.1:%REACT_PORT%/
echo   backend:  http://127.0.0.1:%SERVER_PORT%/
echo   health:   http://127.0.0.1:%SERVER_PORT%/api/health
echo   admin:    http://127.0.0.1:%REACT_PORT%/admin
echo             token: dev-only-admin-token-0123456789abcdef0123456789abcdef0123456789abcdef
echo   logs:     %LOG_DIR%
echo   stop:     scripts\dev-stop.cmd
echo   status:   scripts\dev-status.cmd
exit /b 0
