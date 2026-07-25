@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."

set "ROOT=%CD%"
set "PID_DIR=%ROOT%\.dev-pids"
set "SERVER_PORT=8081"
set "REACT_PORT=3010"

echo [dev-status] root: %ROOT%
echo.

if exist "%PID_DIR%\server.pid" (
  set /p SPID=<"%PID_DIR%\server.pid"
  echo server pid file: !SPID!
) else (
  echo server pid file: none
)

if exist "%PID_DIR%\client-react.pid" (
  set /p CPID=<"%PID_DIR%\client-react.pid"
  echo client-react pid file: !CPID!
) else (
  echo client-react pid file: none
)

echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "function Show-Port($port, $label) { $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue; if ($conns) { $conns | ForEach-Object { Write-Host ($label + ' port ' + $port + ' LISTEN pid=' + $_.OwningProcess) } } else { Write-Host ($label + ' port ' + $port + ' not listening') } }; Show-Port %SERVER_PORT% 'server'; Show-Port %REACT_PORT% 'client-react'"

echo.
echo frontend: http://127.0.0.1:%REACT_PORT%/
echo backend:  http://127.0.0.1:%SERVER_PORT%/
echo health:   http://127.0.0.1:%SERVER_PORT%/api/health
echo logs:     %ROOT%\.dev-logs
exit /b 0
