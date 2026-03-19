@echo off
title NexTerm - Dev Mode
echo.
echo  ========================================
echo    NexTerm - Dev Mode
echo  ========================================
echo.

if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/3] Dependencies OK
)

echo [2/3] Building TypeScript...
call npx tsc
if errorlevel 1 (
    echo [ERROR] TypeScript build failed
    pause
    exit /b 1
)

echo [3/3] Starting NexTerm (DevTools ON)
echo.
echo  Shortcuts:
echo    Ctrl+Shift+P  Command Palette
echo    Ctrl+N        New Workspace
echo    Ctrl+D        Split Horizontal
echo    Ctrl+Shift+D  Split Vertical
echo    Ctrl+B        Toggle Sidebar
echo.
call npx electron . --dev
