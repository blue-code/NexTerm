---
프로젝트명: NexTerm
작업일시: 2026-05-21 11:04
작성자: Kent
세션목적: 프로젝트 기능 스펙 명세서 작성
---

# NexTerm 프로젝트 구현 및 아키텍처 스펙 명세서

본 문서는 **NexTerm**의 현재 기능 명세, 설계 아키텍처, 그리고 컴포넌트 간 통신 규약을 정리한 마스터 스펙 문서입니다. 새로운 세션이나 다른 개발 환경에서 본 프로젝트를 인계받아 작업할 때 이 문서를 기준으로 동작 방식과 설계 사상을 파악합니다.

---

## 1. 프로젝트 개요

**NexTerm**은 Windows 환경에서 AI 코딩 에이전트(Claude Code, Codex, Gemini 등)를 효율적으로 사용하기 위해 설계된 **Windows 터미널 멀티플렉서**입니다.
- **주요 목표**: 여러 터미널을 분할 화면으로 관리하며, 각 터미널에서 실행 중인 AI 에이전트의 상태를 감지하고 세션 복원 시 끊김 없이 에이전트를 자동 재개하는 환경 제공.

---

## 2. 기술 스택 및 빌드 파이프라인

- **런타임**: Electron (Node.js + Chromium)
- **언어**: TypeScript
- **터미널**: xterm.js (렌더러) & node-pty (메인 프로세스에서 의사 터미널 구동)
- **빌드 도구**: 
  - Main Process: `tsc` (TypeScript Compiler) -> 컴파일 결과물은 `dist/main/`에 적재
  - Renderer Process: `esbuild` -> 번들링하여 `dist/renderer/app.js`로 출력
- **테스트**: Vitest (단위 테스트 도구)

---

## 3. 핵심 아키텍처 및 보안 모델

### 3.1 프로세스 분리 구조
- **Main Process** (`src/main/`):
  - 백엔드 영역으로 Node.js API 직접 사용.
  - `node-pty` 프로세스 스폰 및 라이프사이클 관리.
  - 세션 영속화 서비스 및 시스템 설정 저장/로드.
  - Named Pipe를 사용한 외부 IPC 서버 구동.
- **Renderer Process** (`src/renderer/`):
  - 프론트엔드 UI 영역. xterm.js 마운트 및 레이아웃 렌더링 담당.
  - 보안을 위해 `nodeIntegration: false`, `contextIsolation: true`로 동작.
- **Shared Types** (`src/shared/types.ts`):
  - 프로세스 간 통신(IPC) 채널 및 공통 인터페이스 규약 정의.

### 3.2 IPC 보안 모델 (Preload Bridge)
- `src/main/preload.ts`에서 화이트리스트 채널만 허용하여 브릿지를 제공합니다.
  - `ALLOWED_INVOKE`, `ALLOWED_SEND`, `ALLOWED_ON`에 등록되지 않은 채널은 전송 차단.
  - 렌더러는 `window.electronAPI`를 통해서만 메인 프로세스와 통신 가능.

---

## 4. 상세 기능 명세 (Spec)

### 4.1 터미널 DOM 풀링 및 렌더링
- **스펙**: 워크스페이스 전환이나 레이아웃 분할 시 터미널 인스턴스가 파괴되지 않아야 함.
- **구현**: 렌더러의 `terminalPool` 레이어(`display: none`)에서 xterm 인스턴스를 유지하며, 레이아웃 변경 시 해당 DOM 노드를 파괴하는 대신 새로운 위치로 이동(Reparenting)하여 세션 연속성을 보장함.

### 4.2 분할 레이아웃 관리
- **스펙**: 터미널 윈도우를 상하/좌우로 무한히 분할할 수 있어야 함.
- **구현**: `SplitNode` 기반의 재귀적 트리 구조 사용 (`src/renderer/layout.ts`). 분할 및 제거는 트리 구조 변환을 수행하는 순수 함수군으로 제어됨.

### 4.3 AI 에이전트 감지 서비스 (`AgentDetectService`)
- **스펙**: 터미널 출력 스트림을 실시간 감시하여 사용자가 실행한 AI 에이전트 종류를 감지해야 함.
- **동작**:
  - `feed(panelId, data)`를 통해 터미널 바이트 출력을 파싱.
  - 각 에이전트(Claude Code, Codex, Gemini 등)의 프롬프트 패턴 및 명령어 입력 양식을 바탕으로 현재 터미널이 에이전트 대화 상태인지 혹은 일반 셸 상태인지 동적으로 판별.
  - 상태 정보를 렌더러로 동기화하여 UI에 에이전트 동작 여부를 표시함.

### 4.4 세션 저장 및 자동 복원
- **스펙**: 프로그램이 종료되었다가 다시 켜질 때 이전 창 크기, 워크스페이스 구조, 열려 있던 터미널 경로(CWD), 셸 종류가 그대로 복원되어야 함.
- **구현**: `main.ts`에서 8초 주기 또는 렌더러의 `SESSION_SAVE` 이벤트를 받아 세션 데이터를 `%APPDATA%/nexterm/session.json`에 기록함.

### 4.5 AI 에이전트 자동 재개 (Auto-Resume Agents) - *v1.0.1 신규*
- **스펙**: 세션 복원 시, 이전에 터미널에서 구동 중이던 AI 에이전트를 자동으로 실행하여 이전 흐름을 즉시 이어가도록 지원해야 함.
- **세부 동작 사양**:
  1. **설정 연동**: `AppSettings.autoResumeAgents` 옵션이 활성화되어 있어야 동작함.
  2. **재개 명령 바인딩**:
     - `Claude Code` -> `claude -c`
     - `Codex` -> `codex resume`
     - `Gemini` -> `gemini`
  3. **입력 타이밍 제어**:
     - 새 터미널 생성 시 셸 초기화 스크립트 및 출력 타이밍과의 충돌을 방지하기 위해 출력을 감시함.
     - 출력이 도착할 때마다 타이머를 리셋하며, 마지막 출력 후 일정 시간(`RESUME_IDLE_MS = 600ms`) 동안 추가 출력이 없을 때(안정 상태) 셸에 재개 명령어를 한 번 입력(`\r` 포함)함.
     - 만약 출력이 멈추지 않고 계속되는 경우를 대비해 데드라인 타이머(`RESUME_DEADLINE_MS = 5000ms`)가 만료되면 강제로 1회 명령어를 주입함.
  4. **상태 초기화**:
     - 세션이 저장될 때 `agentDetectService.getLastAgentName(panelId)`를 구하여 패널의 `resumeAgent` 필드에 영속화함.
     - 사용자가 에이전트를 정상 종료하여 셸로 빠져나온 패널은 `resumeAgent`가 `null`이 되어 다음 부팅 시 자동 재개 대상에서 제외됨.

---

## 5. 품질 및 테스트 스펙

TDD 철학에 따라 기능의 유의미한 수정 시 테스트 코드를 반드시 동반하거나 기존 테스트 스펙을 통과해야 합니다.
- **유닛 테스트**: `tests/` 디렉토리 내에 Vitest 기반 테스트 스위트가 구동됨.
  - `agent-detect-service.test.ts`: 에이전트 감지 패턴 및 상태 전환 검증.
  - `layout.test.ts`: 분할 트리 변환 로직 검증.
  - `clipboard.test.ts`, `logger.test.ts`, `utils.test.ts` 등 총 85개의 핵심 기능 단위 검증 완료.

---
*본 문서는 기능 추가 및 사양 변경 시 가장 먼저 갱신되어 개발의 표준 명세 역할을 수행합니다.*
