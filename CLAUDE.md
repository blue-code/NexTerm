# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개발 방법론

본 프로젝트는 **SDD(Schema-Driven Development)**, **DDD(Domain-Driven Design)**, **TDD(Test-Driven Development)**를 기본 개발 방식으로 채택한다.

- **SDD(Spec-Driven Development)**: 구현 전 스펙(명세)을 먼저 작성한다. 타입 정의, API 계약, 동작 명세를 선행하고 이를 기준으로 구현한다.
- **DDD**: 도메인별 서비스 분리 (TerminalService, GitService, SessionService 등). 각 도메인의 책임 경계를 명확히 유지한다.
- **TDD**: 기능 구현 전 테스트를 작성한다. Vitest 사용 (`npm run test`, `npm run test:watch`).

## 빌드 및 실행

```bash
npm run build          # 메인(tsc) + 렌더러(esbuild) 순차 빌드
npm run build:main     # TypeScript → dist/main/ (tsc)
npm run build:renderer # esbuild → dist/renderer/app.js (IIFE 번들)
npm run dev            # 빌드 후 --dev 플래그로 실행 (디버그 로깅)
npm run dev:watch      # 렌더러 감시 모드 (Ctrl+R로 리로드)
npm run start          # 빌드 후 Electron 실행

npm run dist:win       # Windows EXE/Portable 패키징
npm run dist:mac       # macOS DMG 패키징
npm run test           # Vitest 단일 실행
npm run test:watch     # Vitest 감시 모드
```

렌더러는 esbuild로 번들링(`scripts/build-renderer.js`), 메인은 tsc로 컴파일. 렌더러 소스(`src/renderer/`)는 tsconfig에서 제외됨.

## 아키텍처

### 프로세스 분리

- **Main Process** (`src/main/`): Electron 메인. node-pty 터미널 관리, Git/포트 스캔, 세션 저장, Named Pipe IPC 서버
- **Renderer Process** (`src/renderer/`): UI 렌더링. xterm.js 터미널, 워크스페이스/패널 관리, DOM 기반 분할 레이아웃
- **Shared** (`src/shared/types.ts`): 양쪽에서 사용하는 타입 정의 (WorkspaceState, PanelState, AppSettings, IPC_CHANNELS)

### IPC 보안 모델 (contextIsolation)

`nodeIntegration: false` + `contextIsolation: true` 환경. 렌더러는 `window.electronAPI`만 사용 가능.

- `src/main/preload.ts`에서 화이트리스트(`ALLOWED_INVOKE`, `ALLOWED_SEND`, `ALLOWED_ON`)로 허용 채널 제어
- 새 IPC 채널 추가 시 **반드시 preload.ts 화이트리스트에 등록** 필요
- 렌더러에서 `electronAPI.invoke()`, `electronAPI.send()`, `electronAPI.on()` 사용
- 클립보드: `electronAPI.clipboard.readText()` / `writeText()`

### 렌더러 상태 관리

- `src/renderer/state.ts`: 전역 상태 객체 + `electronAPI` 참조
- 순환 의존성 방지: `setRenderCallbacks()`로 렌더링 함수를 콜백으로 등록, `triggerSidebarRender()` / `triggerContentRender()` 호출

### 터미널 DOM 풀링

`terminalPool` (`display: none`) div에서 xterm 인스턴스를 보존. 레이아웃 재렌더 시에도 터미널이 파괴되지 않고 reparent만 수행.

### 분할 레이아웃

`SplitNode` 재귀 트리 구조 (`src/renderer/layout.ts`). `splitNodeAt()` / `removeNodeFrom()` 순수 함수로 트리 변환.

### CLI 제어 (Named Pipe)

`\\.\pipe\nexterm-ipc`로 외부 CLI에서 JSON-RPC 메시지 전송. `nt` 명령어(PowerShell 함수 / cmd.exe `nt.cmd`)로 새 패널 생성.

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `src/main/main.ts` | 앱 진입점, IPC 핸들러, 세션 자동 저장(8초) |
| `src/main/preload.ts` | contextBridge 화이트리스트 |
| `src/main/services/terminal-service.ts` | node-pty 래핑, 자식 프로세스 감시, 셸 인자 빌드 |
| `src/renderer/app.ts` | 렌더러 진입점 (esbuild 엔트리) |
| `src/renderer/state.ts` | 전역 상태 + electronAPI 참조 |
| `src/renderer/terminal.ts` | xterm.js 인스턴스 생성/관리, Ctrl+C/V 처리 |
| `src/renderer/workspace.ts` | 워크스페이스/패널 CRUD |
| `src/renderer/render.ts` | 사이드바/콘텐츠 DOM 렌더링 |
| `src/renderer/themes.ts` | 6종 테마 정의 (xterm 색상 + CSS 변수) |
| `src/shared/types.ts` | 공유 타입, IPC_CHANNELS 상수 |

## 테마 시스템

CSS 변수(`data-theme` 속성) + xterm 터미널 색상 동시 전환. `styles.css`에 `[data-theme="..."]` 셀렉터로 정의. `themes.ts`에 `TERMINAL_THEMES` 객체.

테마 종류: dark (Tokyo Night), light, sakura, monokai, nord, solarized

## 주의사항

- 렌더러에서 `require('electron')` 사용 불가 → `electronAPI` 사용
- 새 IPC 채널 추가 시 `preload.ts`의 `ALLOWED_*` Set에 반드시 등록
- xterm.js 관련 Ctrl+C/V는 `terminal.ts`의 DOM `keydown` 리스너에서 처리 (customKeyEventHandler 아님)
- `node-pty`는 `asar` 언팩 필요 (`asarUnpack` 설정 참고)
- 설정은 `%APPDATA%/nexterm/settings.json`에 영속화
- 세션은 `%APPDATA%/nexterm/session.json`에 저장 (24시간 만료)
