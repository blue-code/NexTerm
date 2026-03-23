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
  unreadNotifications: number;
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

export interface AppNotification {
  id: string;
  workspaceId: string;
  panelId: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
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
  notificationSound: boolean;
  sessionRestoreEnabled: boolean;
  socketControlMode: 'off' | 'nextermOnly' | 'automation' | 'password' | 'allowAll';
  defaultShell: string; // 기본 셸 (powershell.exe, cmd.exe 등)
  externalUrlPatterns: string[]; // 외부 브라우저로 열 URL 패턴 (glob 형태)
  language: string; // UI 언어 (ko, en, ja, zh)
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

  // 패널
  PANEL_SPLIT: 'panel:split',
  PANEL_CLOSE: 'panel:close',
  PANEL_FOCUS: 'panel:focus',

  // 브라우저
  BROWSER_OPEN: 'browser:open',
  BROWSER_NAVIGATE: 'browser:navigate',

  // 알림
  NOTIFICATION_SEND: 'notification:send',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_LIST: 'notification:list',

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
