@echo off
setlocal EnableExtensions
cd /d "%~dp0.."

echo [sim-6p] ensure server is up on 8081...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8081/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -ne 200) { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo [sim-6p] server not running - start with scripts\dev-start.cmd
  exit /b 1
)

echo [sim-6p] running node scripts\sim-6p.js %*
echo [sim-6p] tip: use --watch to slow down and print spectate URL
echo [sim-6p]   node scripts\sim-6p.js --watch
echo [sim-6p]   node scripts\sim-6p.js --watch --delay 800 --max-steps 2000
node scripts\sim-6p.js %*
exit /b %ERRORLEVEL%
