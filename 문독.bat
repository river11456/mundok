@echo off
setlocal

set "PORT=19234"
set "SCRIPT_DIR=%~dp0"
set "PYTHON_CMD=python"

where py >nul 2>nul
if %ERRORLEVEL%==0 set "PYTHON_CMD=py -3"

rem If another local Mundok server is already using the port, stop it first.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; $ports | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>nul

rem Open the browser once the server is ready.
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 100; $i++) { try { Invoke-WebRequest 'http://localhost:%PORT%/api/version' -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process 'http://localhost:%PORT%'; break } catch { Start-Sleep -Milliseconds 300 } }"

%PYTHON_CMD% "%SCRIPT_DIR%server.py"

endlocal
