@echo off
REM Amphicos FPSO Digital Twin launcher for Windows. Works fully offline.
REM Default: opens the single-file build in the default browser (Chrome or Edge recommended).
REM "Start_Digital_Twin.bat serve" instead serves dist\ on http://127.0.0.1:8080 (needs Node.js 18 or newer).
REM In serve mode the browser is opened only after the server answers.
setlocal
cd /d "%~dp0"
if /I "%~1"=="serve" goto serve
if exist "dist-single\Amphicos_FPSO_Digital_Twin.html" (
  start "" "dist-single\Amphicos_FPSO_Digital_Twin.html"
  goto end
)
echo The single-file build was not found. Run "npm install" and "npm run build" first.
pause
goto end
:serve
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Opening the single-file build instead.
  start "" "dist-single\Amphicos_FPSO_Digital_Twin.html"
  goto end
)
start "Amphicos twin server (close this window to stop)" /min node tools\serve.mjs dist 8080
set /a tries=0
:wait
set /a tries+=1
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri 'http://127.0.0.1:8080/' | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 goto open
if %tries% GEQ 30 goto noanswer
timeout /t 1 /nobreak >nul
goto wait
:open
start "" "http://127.0.0.1:8080/"
echo The twin is served at http://127.0.0.1:8080/ . Close the minimised server window to stop it.
goto end
:noanswer
echo The local server did not answer within 30 seconds. Opening the single-file build instead.
start "" "dist-single\Amphicos_FPSO_Digital_Twin.html"
:end
endlocal
