@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

set "ROOT=%CD%"
set "PID_DIR=%ROOT%\.dev-pids"
set "REACT_PORT=3010"

echo [dev-react-stop] root: %ROOT%

call :stop_pid_file "%PID_DIR%\client-react.pid" "client-react"

echo [dev-react-stop] free port %REACT_PORT% if still in use...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-NetTCPConnection -LocalPort %REACT_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $procId = $_.OwningProcess; if ($procId -and $procId -ne 0) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host ('[dev-react-stop] killed pid ' + $procId + ' on port ' + %REACT_PORT%) } catch { Write-Host ('[dev-react-stop] could not kill pid ' + $procId) } } }"

if exist "%PID_DIR%\client-react.pid" del /q "%PID_DIR%\client-react.pid" >nul 2>&1

echo [dev-react-stop] done
exit /b 0

:stop_pid_file
set "FILE=%~1"
set "NAME=%~2"
if not exist "%FILE%" (
  echo [dev-react-stop] no %NAME% pid file
  goto :eof
)
set /p PID=<"%FILE%"
if "%PID%"=="" (
  echo [dev-react-stop] empty %NAME% pid file
  del /q "%FILE%" >nul 2>&1
  goto :eof
)
echo [dev-react-stop] stopping %NAME% pid %PID% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$procId = %PID%; if (Get-Process -Id $procId -ErrorAction SilentlyContinue) { Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $procId } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }; try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Host '[dev-react-stop] stopped %NAME%' } catch { Write-Host '[dev-react-stop] failed to stop %NAME%' } } else { Write-Host '[dev-react-stop] %NAME% pid not running' }"
del /q "%FILE%" >nul 2>&1
goto :eof
