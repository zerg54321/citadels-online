@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "ROOT=%CD%"
set "PID_DIR=%ROOT%\.dev-pids"
set "SERVER_PORT=8081"
set "CLIENT_PORT=3000"

echo [dev-stop] root: %ROOT%

call :stop_pid_file "%PID_DIR%\server.pid" "server"
call :stop_pid_file "%PID_DIR%\client.pid" "client"

echo [dev-stop] free ports %SERVER_PORT% and %CLIENT_PORT% if still in use...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(%SERVER_PORT%, %CLIENT_PORT%); foreach ($port in $ports) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $procId = $_.OwningProcess; if ($procId -and $procId -ne 0) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host ('[dev-stop] killed pid ' + $procId + ' on port ' + $port) } catch { Write-Host ('[dev-stop] could not kill pid ' + $procId + ' on port ' + $port) } } } }"

if exist "%PID_DIR%" (
  del /q "%PID_DIR%\*.pid" >nul 2>&1
)

echo [dev-stop] done
exit /b 0

:stop_pid_file
set "FILE=%~1"
set "NAME=%~2"
if not exist "%FILE%" (
  echo [dev-stop] no %NAME% pid file
  goto :eof
)
set /p PID=<"%FILE%"
if "%PID%"=="" (
  echo [dev-stop] empty %NAME% pid file
  del /q "%FILE%" >nul 2>&1
  goto :eof
)
echo [dev-stop] stopping %NAME% pid %PID% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procId = %PID%; if (Get-Process -Id $procId -ErrorAction SilentlyContinue) { Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $procId } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }; try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host '[dev-stop] stopped %NAME%' } catch { Write-Host '[dev-stop] failed to stop %NAME%' } } else { Write-Host '[dev-stop] %NAME% pid not running' }"
del /q "%FILE%" >nul 2>&1
goto :eof
