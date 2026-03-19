@echo off
chcp 65001 >nul 2>&1
title NexTerm - macOS 빌드 (DMG)
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   NexTerm - macOS DMG 빌드          ║
echo  ╚══════════════════════════════════════╝
echo.
echo  [참고] macOS 빌드는 Windows에서도 실행 가능하지만,
echo         코드 서명(Code Signing)은 macOS에서만 가능합니다.
echo         서명 없이 빌드된 DMG는 Gatekeeper 경고가 표시됩니다.
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

:: Electron Builder (macOS)
echo [3/4] macOS 패키징 중... (DMG)
echo        이 과정은 수 분이 소요될 수 있습니다.
echo.
call npx electron-builder --mac
if errorlevel 1 (
    echo.
    echo [오류] electron-builder 실패
    echo        macOS DMG 빌드는 Windows에서 제한될 수 있습니다.
    echo        macOS 환경 또는 CI/CD(GitHub Actions) 사용을 권장합니다.
    pause
    exit /b 1
)

:: 결과 안내
echo.
echo [4/4] 빌드 완료!
echo.
echo  ┌──────────────────────────────────────────┐
echo  │  출력 경로: release\                      │
echo  │                                           │
echo  │  - NexTerm-x.x.x.dmg  (macOS 설치 이미지)│
echo  └──────────────────────────────────────────┘
echo.

explorer release
pause
