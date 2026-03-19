@echo off
chcp 65001 >nul 2>&1
title NexTerm - 개발 모드
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   NexTerm - 개발 모드 실행           ║
echo  ╚══════════════════════════════════════╝
echo.

:: 의존성 확인
if not exist "node_modules" (
    echo [1/3] 의존성 설치 중...
    call npm install
    if errorlevel 1 (
        echo [오류] npm install 실패
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/3] 의존성 확인 완료
)

:: TypeScript 빌드
echo [2/3] TypeScript 빌드 중...
call npx tsc
if errorlevel 1 (
    echo [오류] TypeScript 빌드 실패
    pause
    exit /b 1
)

:: Electron 실행 (DevTools 활성)
echo [3/3] NexTerm 실행 중... (DevTools 활성)
echo.
echo  단축키:
echo    Ctrl+Shift+P  커맨드 팔레트
echo    Ctrl+N        새 워크스페이스
echo    Ctrl+D        수평 분할
echo    Ctrl+Shift+D  수직 분할
echo    Ctrl+B        사이드바 토글
echo.
call npx electron . --dev
