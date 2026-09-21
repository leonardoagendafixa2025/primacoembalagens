@echo off
title PLMPackLib Bridge - CorelDRAW & Illustrator
cd /d "%~dp0"
echo ========================================================================
echo  INICIANDO PLMPACKLIB BRIDGE (PORTA 48123)
echo ========================================================================
echo.
node bridge/server.cjs
pause
