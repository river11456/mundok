@echo off
setlocal

set "PORT=19234"
set "SCRIPT_DIR=%~dp0"
set "PORT_FILE=%SCRIPT_DIR%.runport"
set "PYTHON_CMD=python"

where py >nul 2>nul
if %ERRORLEVEL%==0 set "PYTHON_CMD=py -3"

rem If our server is already running, just open the browser to it and exit (no force-kill).
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest 'http://localhost:%PORT%/api/version' -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process 'http://localhost:%PORT%'; exit 0 } catch { exit 1 }" >nul 2>nul
if %ERRORLEVEL%==0 goto :eof

del "%PORT_FILE%" >nul 2>nul

rem Open the browser once server.py records its actual port (it falls back to a free port if %PORT% is busy).
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 100; $i++) { if (Test-Path '%PORT_FILE%') { $p = (Get-Content '%PORT_FILE%' -Raw).Trim(); if ($p) { try { Invoke-WebRequest ('http://localhost:' + $p + '/api/version') -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process ('http://localhost:' + $p); break } catch {} } }; Start-Sleep -Milliseconds 300 }"

%PYTHON_CMD% "%SCRIPT_DIR%server.py"

endlocal
