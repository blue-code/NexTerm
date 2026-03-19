# NexTerm

AI 코딩 에이전트를 위한 Windows 터미널 멀티플렉서.
[cmux](https://github.com/manaflow-ai/cmux)(macOS)의 핵심 기능을 Windows용 Electron 앱으로 재구현했다.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)
![xterm.js](https://img.shields.io/badge/xterm.js-5.4-000000?logo=windowsterminal&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| **워크스페이스** | 탭 기반 독립 작업 공간, 사이드바에서 Git branch / PR / 포트 실시간 표시 |
| **분할 패널** | 수평·수직 무제한 분할, 드래그 비율 조절, 비포커스 패널 반투명 처리 |
| **터미널** | ConPTY + xterm.js WebGL 가속 렌더링, Tokyo Night 테마, 10,000줄 스크롤백 |
| **내장 브라우저** | Chromium 기반 webview, 뒤로/앞으로/새로고침, URL 바 |
| **알림 시스템** | AI 에이전트 알림 수신, Windows Toast 연동, 사이드바 배지 표시 |
| **커맨드 팔레트** | `Ctrl+Shift+P`로 전체 명령 검색·실행 |
| **CLI 원격 제어** | Named Pipe IPC를 통해 외부에서 워크스페이스/패널/알림 제어 |
| **세션 복원** | 8초 간격 자동 저장, 레이아웃·작업 디렉토리·브라우저 URL 복원 |
| **Git 연동** | 브랜치명, dirty 상태, PR 번호 자동 감지 (`git` + `gh` CLI) |
| **포트 감지** | `netstat` 기반 리스닝 포트 실시간 스캔, 사이드바에 표시 |

---

## 기술 스택

| 계층 | 기술 |
|---|---|
| 프레임워크 | Electron 28 |
| 언어 | TypeScript 5.3 |
| 터미널 엔진 | node-pty (ConPTY) + xterm.js (WebGL) |
| 브라우저 | Electron webview (Chromium) |
| IPC | Named Pipe (`\\.\pipe\nexterm-ipc`) |
| 빌드 | electron-builder (NSIS / DMG) |

---

## 시작하기

### 사전 요구사항

- **Node.js** 18 이상
- **npm** 9 이상
- **Git** (Git 연동 기능용)
- **GitHub CLI** (PR 정보 표시용, 선택)

### 설치 및 실행

```bash
git clone https://github.com/blue-code/NexTerm.git
cd NexTerm
npm install
```

#### 개발 모드

```bash
# bat 파일 사용
dev.bat

# 또는 npm 스크립트
npm run dev
```

DevTools가 자동으로 열리며, 코드 수정 후 다시 실행하면 반영된다.

#### 배포 빌드

```bash
# Windows EXE (NSIS 설치 파일 + Portable)
build-win.bat

# macOS DMG
build-mac.bat

# 전체 플랫폼 동시 빌드
build-all.bat
```

빌드 결과물은 `release/` 디렉토리에 생성된다.

---

## 단축키

| 키 | 동작 |
|---|---|
| `Ctrl+Shift+P` | 커맨드 팔레트 |
| `Ctrl+N` | 새 워크스페이스 |
| `Ctrl+W` | 패널 닫기 |
| `Ctrl+Shift+W` | 워크스페이스 닫기 |
| `Ctrl+D` | 수평 분할 |
| `Ctrl+Shift+D` | 수직 분할 |
| `Ctrl+B` | 사이드바 토글 |
| `Ctrl+Shift+B` | 브라우저 패널 열기 |
| `Ctrl+F` | 터미널 내 검색 |
| `Ctrl+Tab` | 다음 워크스페이스 |
| `Ctrl+Shift+Tab` | 이전 워크스페이스 |
| `Ctrl+]` | 다음 패널로 이동 |
| `Ctrl+[` | 이전 패널로 이동 |
| `Ctrl+Shift+U` | 알림 페이지 |

---

## CLI 사용법

NexTerm이 실행 중일 때, Named Pipe를 통해 외부에서 제어할 수 있다.

```bash
# 새 워크스페이스 생성
nexterm new-workspace --name "프로젝트A" --cwd "C:\Dev\project-a"

# 패널 분할
nexterm new-split --direction vertical

# 브라우저 열기
nexterm open-browser --url "http://localhost:3000"

# 알림 보내기 (AI 에이전트에서 호출)
nexterm notify --title "빌드 완료" --body "테스트 전체 통과"

# 특정 패널에 텍스트 전송
nexterm send --panel-id <ID> --text "npm run test"

# 창 활성화
nexterm focus-window
```

---

## 프로젝트 구조

```
NexTerm/
├── dev.bat                  # 개발 모드 실행
├── build-win.bat            # Windows EXE 빌드
├── build-mac.bat            # macOS DMG 빌드
├── build-all.bat            # 전체 플랫폼 빌드
├── package.json
├── tsconfig.json
├── assets/
│   └── icon.svg
├── src/
│   ├── shared/
│   │   └── types.ts         # 공유 타입 정의
│   ├── main/                # Electron 메인 프로세스
│   │   ├── main.ts          # 앱 진입점, IPC 핸들러
│   │   ├── services/
│   │   │   ├── terminal-service.ts    # ConPTY 터미널 관리
│   │   │   ├── git-service.ts         # Git/PR 상태 조회
│   │   │   ├── port-scanner-service.ts # 리스닝 포트 감지
│   │   │   └── session-service.ts     # 세션 저장/복원
│   │   └── ipc/
│   │       └── pipe-server.ts         # Named Pipe IPC 서버
│   ├── renderer/            # Electron 렌더러 프로세스
│   │   ├── index.html       # 메인 UI
│   │   ├── styles.css       # Tokyo Night 테마
│   │   └── app.js           # 앱 로직 (워크스페이스, 패널, 단축키)
│   └── cli/
│       └── nexterm.ts       # CLI 도구
└── release/                 # 빌드 결과물 (gitignore)
```

---

## cmux 대비 기능 매핑

| cmux (macOS) | NexTerm (Windows) | 비고 |
|---|---|---|
| libghostty (Metal) | xterm.js (WebGL) | GPU 가속 터미널 렌더링 |
| WebKit 브라우저 | Chromium webview | Electron 내장 |
| Bonsplit 레이아웃 | 트리 기반 분할 엔진 | 수평/수직 무제한 |
| Unix Domain Socket | Named Pipe | `\\.\pipe\nexterm-ipc` |
| `ps` + `lsof` | `netstat` | 포트 스캔 |
| UNUserNotificationCenter | Windows Toast | 시스템 알림 |
| Sparkle 자동 업데이트 | - | 미구현 (향후 추가) |
| SSH 원격 데몬 | - | 미구현 (향후 추가) |
| SOCKS5 프록시 터널 | - | 미구현 (향후 추가) |

---

## 라이선스

MIT
