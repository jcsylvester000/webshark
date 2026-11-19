@echo off
rem Slyshark first-time setup on this computer.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local\setup.ps1" %*
echo.
pause
