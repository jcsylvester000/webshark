@echo off
rem Start Slyshark on this computer (http://localhost:3000). Close this window or press Ctrl+C to stop.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local\start.ps1" %*
echo.
pause
