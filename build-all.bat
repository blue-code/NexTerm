@echo off
title NexTerm - All Platforms Build
echo.
echo  ========================================
echo    NexTerm - All Platforms Build
echo    (Windows EXE + macOS DMG)
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

echo [3/4] Packaging all platforms...
echo        This may take a long time.
echo.
call npx electron-builder --win --mac
if errorlevel 1 (
    echo.
    echo [WARNING] Some platform builds may have failed.
    echo           macOS DMG build may be limited on Windows.
)

echo.
echo [4/4] Build complete!
echo.
echo  Output: release\
echo    Windows:
echo      - NexTerm-x.x.x-Setup.exe     (NSIS Installer)
echo      - NexTerm-x.x.x-Portable.exe  (Portable)
echo    macOS:
echo      - NexTerm-x.x.x.dmg           (macOS Installer)
echo.

explorer release
pause
