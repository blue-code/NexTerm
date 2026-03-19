@echo off
chcp 65001 >nul 2>&1
title NexTerm - 전체 플랫폼 빌드
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   NexTerm - 전체 플랫폼 빌드        ║
echo  ║   (Windows EXE + macOS DMG)          ║
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

:: Electron Builder (전체 플랫폼)
echo [3/4] 전체 플랫폼 패키징 중...
echo        이 과정은 상당한 시간이 소요될 수 있습니다.
echo.
call npx electron-builder --win --mac
if errorlevel 1 (
    echo.
    echo [경고] 일부 플랫폼 빌드가 실패했을 수 있습니다.
    echo        macOS DMG는 Windows에서 제한될 수 있습니다.
)

:: 결과 안내
echo.
echo [4/4] 빌드 완료!
echo.
echo  ┌──────────────────────────────────────────────────┐
echo  │  출력 경로: release\                              │
echo  │                                                   │
echo  │  Windows:                                         │
echo  │    - NexTerm-x.x.x-Setup.exe  (NSIS 설치 파일)   │
echo  │    - NexTerm-x.x.x-Portable.exe (포터블)         │
echo  │  macOS:                                           │
echo  │    - NexTerm-x.x.x.dmg  (설치 이미지)            │
echo  └──────────────────────────────────────────────────┘
echo.

explorer release
pause
