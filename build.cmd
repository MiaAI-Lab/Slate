@echo off
rem Double-click-friendly wrapper for build.ps1.
rem Just runs the script with current version (no bump). Pass args through
rem if launched from a terminal: build.cmd -Bump patch
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
if errorlevel 1 pause
