@echo off
title Push Nimbus Drive to GitHub
cd /d "%~dp0"
echo ===================================================
echo   Pushing Nimbus Drive to GitHub Repository
echo   https://github.com/yash69yadav/Nimbus-drive
echo ===================================================
echo.
echo If a GitHub login window opens in your browser, please click "Authorize".
echo.
git push -u origin main
echo.
echo ===================================================
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Your code is now live on GitHub!
    echo Check: https://github.com/yash69yadav/Nimbus-drive
) else (
    echo [NOTICE] If prompted for credentials, please sign in.
)
echo ===================================================
echo.
pause
