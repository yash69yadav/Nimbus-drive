@echo off
title Push Nimbus Drive to GitHub
cd /d "%~dp0"
echo ===================================================
echo   Syncing all code changes to GitHub & Vercel
echo   https://github.com/yash69yadav/Nimbus-drive
echo ===================================================
echo.
git add .
git commit -m "update: latest code changes"
git push origin main
echo.
echo ===================================================
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Your changes are now LIVE on GitHub and Vercel!
    echo GitHub: https://github.com/yash69yadav/Nimbus-drive
    echo Vercel Live: https://nimbus-drive-gules.vercel.app
) else (
    echo [NOTICE] Please check your internet connection or git login.
)
echo ===================================================
pause
