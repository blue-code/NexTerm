// 전체 앱에서 공유하는 타입 정의

export interface WorkspaceState {
  id: string;
  name: string;
  color?: string; // 워크스페이스 색상 (CSS 색상값)
  panels: PanelState[];
  splitLayout: SplitNode;
  activePanelId: string | null;
  cwd: string;
  gitBranch?: string;
  gitDirty?: boolean;
  prNumber?: number;
  listeningPorts: number[];
  createdAt: number;
}

export type PanelType = 'terminal' | 'browser' | 'markdown';

export interface PanelState {
  id: string;
  type: PanelType;
  title: string;
  // 터미널 패널용
  cwd?: string;
  scrollback?: string;
  shell?: string;
  shellCommand?: string;
  // 새 패널 런처(셸/AI 선택)에서 AI를 고른 경우, 셸이 준비되면 자동 입력할 명령
  // (예: 'claude --dangerously-skip-permissions'). 세션에는 저장하지 않는다(1회성).
  initialCommand?: string;
  // 세션 복원 시 자동 재개할 AI 에이전트 이름 (예: 'Claude Code', 'Codex')
  // 종료 패턴이 매칭된 패널은 null로 비워져 다음 저장에서 자동 해제된다.
  resumeAgent?: string | null;
  // AI 에이전트 상태 (런타임)
  agentStatus?: import('./agent-types').AgentStatus;
  agentName?: string;
  // 브라우저 패널용
  url?: string;
  browserProfile?: string; // partition 이름 (기본: 'default')
  // 마크다운 패널용
  filePath?: string;
}

// 분할 레이아웃 트리 구조 (Bonsplit 대응)
export type SplitNode = SplitBranch | SplitLeaf;

export interface SplitBranch {
  type: 'branch';
  direction: 'horizontal' | 'vertical';
  ratio: number; // 0~1, 첫 번째 자식의 비율
  children: [SplitNode, SplitNode];
}

export interface SplitLeaf {
  type: 'leaf';
  panelId: string;
}

export interface SessionSnapshot {
  version: 1;
  windowBounds: { x: number; y: number; width: number; height: number };
  workspaces: WorkspaceState[];
  activeWorkspaceId: string | null;
  sidebarWidth: number;
  sidebarVisible: boolean;
  savedAt: number;
}

export interface KeyBinding {
  id: string;
  label: string;
  keys: string; // 예: 'Ctrl+Shift+D'
  action: string;
}

export interface AppSettings {
  fontFamily: string;
  fontSize: number;
  scrollbackLimit: number;
  theme: string; // 기본 6종 + 확장 테마 이름
  backgroundImage: string; // 배경 이미지 경로 (빈 문자열이면 비활성)
  sidebarWidth: number;
  unfocusedPanelOpacity: number;
  sessionRestoreEnabled: boolean;
  // 세션 복원 시 이전에 실행 중이던 AI 에이전트(claude, codex 등)를 자동 재개한다.
  autoResumeAgents: boolean;
  socketControlMode: 'off' | 'nextermOnly' | 'automation' | 'password' | 'allowAll';
  defaultShell: string; // 기본 셸 (powershell.exe, cmd.exe 등)
  externalUrlPatterns: string[]; // 외부 브라우저로 열 URL 패턴 (glob 형태)
  language: string; // UI 언어 (ko, en, ja, zh)
  // 하단 상태바에 표시할 AI 도구 사용량 제공자 목록 (체크한 항목만 조회/표시).
  // 터미널 감지 여부와 무관하게 항상 표시한다 — 도구가 사용량 한도로 막혀 프롬프트를
  // 못 띄우는 경우에도(예: Codex 한도 초과) 놓치지 않기 위함.
  usageVisibleProviders: UsageProviderId[];
  // 사용량 자동 새로고침 주기 (초). 제공자별 최소 간격은 main에서 별도 보호.
  usageRefreshIntervalSec: number;
}

// ── AI 도구 사용량 (하단 상태바) ──

export type UsageProviderId = 'none' | 'claude' | 'codex' | 'antigravity';

/** 사용량 윈도우 1개 — 예: 5시간 세션, 주간, Antigravity 모델별 쿼터 */
export interface UsageWindow {
  label: string;              // '세션(5h)' | '주간' | 모델 표시명
  usedPercent: number | null; // 0~100, 알 수 없으면 null
  resetsAt: number | null;    // 리셋 시각 (epoch ms), 알 수 없으면 null
}

/** 제공자별 사용량 스냅샷 — main의 UsageService가 생성 */
export interface UsageSnapshot {
  provider: UsageProviderId;
  ok: boolean;
  error?: string;         // ok=false일 때 사용자 표시용 메시지
  windows: UsageWindow[]; // ok=true일 때 1개 이상
  updatedAt: number;      // 데이터 기준 시각 (epoch ms)
  // codex처럼 "마지막 활동 시점" 데이터라 실시간이 아닐 수 있음을 표시
  stale?: boolean;
}

// IPC 메시지 타입
export interface IpcRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface IpcResponse {
  id: string;
  result?: unknown;
  error?: string;
}

// 메인 ↔ 렌더러 IPC 채널
export const IPC_CHANNELS = {
  // 터미널
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_DATA: 'terminal:data',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_CLOSE: 'terminal:close',
  TERMINAL_CWD: 'terminal:cwd',

  // 워크스페이스
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_CLOSE: 'workspace:close',
  WORKSPACE_RENAME: 'workspace:rename',
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_SELECT: 'workspace:select',
  // 탐색기 "NexTerm으로 열기" 등 외부에서 폴더 경로로 실행/재실행됐을 때
  WORKSPACE_OPEN_PATH: 'workspace:open-path',

  // 패널
  PANEL_SPLIT: 'panel:split',
  PANEL_CLOSE: 'panel:close',
  PANEL_FOCUS: 'panel:focus',

  // 브라우저
  BROWSER_OPEN: 'browser:open',
  BROWSER_NAVIGATE: 'browser:navigate',

  // Git
  GIT_STATUS: 'git:status',

  // 포트
  PORT_SCAN: 'port:scan',

  // 설정
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // 세션
  SESSION_SAVE: 'session:save',
  SESSION_RESTORE: 'session:restore',

  // 앱 / 윈도우
  APP_READY: 'app:ready',
  WINDOW_NEW: 'window:new',

  // AI 에이전트
  AGENT_STATUS_CHANGED: 'agent:status-changed',
  AGENT_GET_STATUS: 'agent:get-status',

  // 브라우저 히스토리
  BROWSER_HISTORY_ADD: 'browser:history-add',
  BROWSER_HISTORY_SEARCH: 'browser:history-search',
  BROWSER_HISTORY_LIST: 'browser:history-list',

  // 키바인딩
  KEYBINDINGS_GET: 'keybindings:get',
  KEYBINDINGS_SET: 'keybindings:set',

  // AI 도구 사용량 (하단 상태바)
  USAGE_GET: 'usage:get',

  // 파일 (마크다운 뷰어 등)
  FILE_READ: 'file:read',
  FILE_WATCH: 'file:watch',
  FILE_UNWATCH: 'file:unwatch',
  FILE_CHANGED: 'file:changed',
} as const;

// ── preload 브릿지 API 타입 ──

export interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, callback: (...args: unknown[]) => void): () => void;
  clipboard: {
    readText(): string;
    writeText(text: string): void;
    saveImageToTemp(): string | null;
  };
  env: {
    USERPROFILE: string;
  };
}

// 렌더러에서 IPC 명령 수신 시 사용하는 타입
export interface IpcCommandPayload {
  method: string;
  params: Record<string, unknown>;
}

// 브라우저 히스토리 항목
export interface BrowserHistoryEntry {
  url: string;
  title: string;
  visitCount: number;
  lastVisitedAt: number;
}

// Git 상태 조회 결과
export interface GitStatusResult {
  branch: string | null;
  dirty: boolean;
  prNumber: number | null;
}
