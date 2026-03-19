@echo off
title NexTerm - Windows Build (EXE)
echo.
echo  ========================================
echo    NexTerm - Windows EXE Build
echo  ========================================
echo.

if exist "release" (
    echo [0/4] Cleaning previous build...
    rmdir /s /q release
    echo.
)

if not exist "node_modules" (
    echo [1/4] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/4] Dependencies OK
)

echo [2/4] Building TypeScript...
call npx tsc
if errorlevel 1 (
    echo [ERROR] TypeScript build failed
    pause
    exit /b 1
)

echo [3/4] Packaging for Windows (NSIS + Portable)...
echo        This may take several minutes.
echo.
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win
if errorlevel 1 (
    echo.
    echo [ERROR] electron-builder failed
    pause
    exit /b 1
)

echo.
echo [4/4] Build complete!
echo.
echo  Output: release\
echo    - NexTerm-x.x.x-Setup.exe   (NSIS Installer)
echo    - NexTerm-x.x.x-Portable.exe (Portable)
echo.

explorer release
pause
