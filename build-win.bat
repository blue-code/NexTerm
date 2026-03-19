@echo off
chcp 65001 >nul 2>&1
title NexTerm - Windows 빌드 (EXE)
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   NexTerm - Windows EXE 빌드        ║
echo  ╚══════════════════════════════════════╝
echo.

:: 이전 빌드 결과물 정리
if exist "release" (
    echo [0/4] 이전 빌드 결과물 정리 중...
    rmdir /s /q release
    echo.
)

:: 의존성 확인
if not exist "node_modules" (
    echo [1/4] 의존성 설치 중...
    call npm install
    if errorlevel 1 (
        echo [오류] npm install 실패
        pause
        exit /b 1
    )
    echo.
) else (
    echo [1/4] 의존성 확인 완료
)

:: TypeScript 빌드
echo [2/4] TypeScript 빌드 중...
call npx tsc
if errorlevel 1 (
    echo [오류] TypeScript 빌드 실패
    pause
    exit /b 1
)

:: Electron Builder (Windows)
echo [3/4] Windows 패키징 중... (NSIS 설치 파일 + Portable)
echo        이 과정은 수 분이 소요될 수 있습니다.
echo.
call npx electron-builder --win
if errorlevel 1 (
    echo.
    echo [오류] electron-builder 실패
    pause
    exit /b 1
)

:: 결과 안내
echo.
echo [4/4] 빌드 완료!
echo.
echo  ┌─────────────────────────────────────────────────┐
echo  │  출력 경로: release\                             │
echo  │                                                  │
echo  │  - NexTerm-x.x.x-Setup.exe  (NSIS 설치 파일)    │
echo  │  - NexTerm-x.x.x-Portable.exe (포터블)          │
echo  └─────────────────────────────────────────────────┘
echo.

:: 빌드 결과 폴더 열기
explorer release
pause
