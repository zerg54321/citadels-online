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

echo [dev-start] building client-react...
REM The server (port 8081) also serves client-react/dist as a static fallback
REM behind the history() SPA shim, so a stale dist would expose an outdated
REM UI to anyone hitting :8081 directly. Rebuild it on every start to keep
REM the served bundle in sync with the source. (Vite dev on :3010 is
REM unaffected ¡ª it serves from source with HMR.)
pushd "%ROOT%\client-react"
call npm.cmd run build
if errorlevel 1 (
  popd
  echo [dev-start] ERROR: client-react build failed
  exit /b 1
)
popd

echo [dev-start] starting server on port %SERVER_PORT%...
REM CITADELS_FAST=1 shortens phase timers (handy for sim-6p); remove for human-paced play
REM ADMIN_TOKEN / ADMIN_ALLOW_IPS enable the local /admin console (dev-only,
REM loopback-restricted). Replace with a random token in prod.
REM Start-Process WITHOUT -RedirectStandard* (UseShellExecute=true) so the
REM long-lived node process does not inherit the caller's stdout pipe handle
REM (which would block `cmd /c dev-start.cmd` from returning). The inner
REM `cmd /c` `>` / `2>` redirects node output to the log files instead.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$env:CITADELS_FAST='1'; $env:ADMIN_TOKEN='dev-only-admin-token-0123456789abcdef0123456789abcdef0123456789abcdef'; $env:ADMIN_ALLOW_IPS='127.0.0.1,::1'; $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c node dist\index.js > %LOG_DIR%\server.out.log 2> %LOG_DIR%\server.err.log' -WorkingDirectory '%ROOT%\server' -WindowStyle Hidden -PassThru; Set-Content -Path '%PID_DIR%\server.pid' -Value $p.Id -Encoding ascii; Write-Host ('[dev-start] server pid ' + $p.Id + ' CITADELS_FAST=1')"
if errorlevel 1 (
  echo [dev-start] ERROR: failed to start server
  exit /b 1
)

echo [dev-start] starting client-react on port %REACT_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c npm.cmd run dev -- --host 0.0.0.0 --port %REACT_PORT% > %LOG_DIR%\client-react.out.log 2> %LOG_DIR%\client-react.err.log' -WorkingDirectory '%ROOT%\client-react' -WindowStyle Hidden -PassThru; Set-Content -Path '%PID_DIR%\client-react.pid' -Value $p.Id -Encoding ascii; Write-Host ('[dev-start] client-react pid ' + $p.Id)"
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
