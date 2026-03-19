@echo off
title NexTerm - macOS Build (DMG)
echo.
echo  ========================================
echo    NexTerm - macOS DMG Build
echo  ========================================
echo.
echo  [NOTE] Cross-platform build from Windows.
echo         Code signing requires macOS.
echo         Unsigned DMG will trigger Gatekeeper warning.
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

echo [3/4] Packaging for macOS (DMG)...
echo        This may take several minutes.
echo.
call npx electron-builder --mac
if errorlevel 1 (
    echo.
    echo [ERROR] electron-builder failed
    echo         macOS DMG build may be limited on Windows.
    echo         Consider using macOS or CI/CD (GitHub Actions).
    pause
    exit /b 1
)

echo.
echo [4/4] Build complete!
echo.
echo  Output: release\
echo    - NexTerm-x.x.x.dmg  (macOS Installer)
echo.

explorer release
pause
