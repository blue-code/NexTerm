/**
 * 전역 상태 관리
 * contextBridge를 통해 노출된 electronAPI를 사용한다.
 * 순환 의존성 방지를 위해 렌더링 콜백을 상태 모듈에서 중개한다.
 */
import type {
  ElectronAPI,
  WorkspaceState,
  PanelState,
  AppSettings,
} from '../../shared/types';
import type { AgentInfo } from '../../shared/agent-types';

/** 닫은 브라우저 패널 복원용 엔트리 */
export interface ClosedBrowserTab {
  url: string;
  title: string;
  browserProfile?: string;
  closedAt: number;
}

// xterm 라이브러리 (번들에 포함)
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';

export { Terminal, FitAddon, SearchAddon, WebglAddon };

// ── Electron API 브릿지 ──

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const electronAPI = window.electronAPI;

// ── 터미널 인스턴스 타입 ──

export interface TerminalInst {
  terminal: InstanceType<typeof Terminal>;
  fitAddon: InstanceType<typeof FitAddon>;
  searchAddon: InstanceType<typeof SearchAddon>;
  container: HTMLDivElement;
}

// ── 렌더러용 런타임 워크스페이스 (WorkspaceState 확장) ──

export interface RuntimeWorkspace extends Omit<WorkspaceState, 'gitBranch' | 'gitDirty' | 'prNumber'> {
  gitBranch: string | null;
  gitDirty: boolean;
  prNumber: number | null;
}

// ── 앱 전역 상태 ──

export const state = {
  workspaces: [] as RuntimeWorkspace[],
  activeWorkspaceId: null as string | null,
  settings: null as AppSettings | null,
  sidebarWidth: 240,
  sidebarVisible: true,
  terminalInstances: new Map<string, TerminalInst>(),
  focusedPanelId: null as string | null,
  defaultShell: 'powershell.exe',
  agentStatuses: new Map<string, AgentInfo>(),
  closedBrowserTabs: [] as ClosedBrowserTab[],
  zoomedPanelId: null as string | null, // 줌된 패널 (null이면 일반 레이아웃)
  focusFollowsMouse: false, // 마우스 hover 시 자동 포커스
  presentationMode: false, // 프레젠테이션 모드 (사이드바/타이틀바 숨김)
  // send-input으로 등록된 "다음 실행 제안" — Enter면 실행, 일반 타이핑이면 폐기,
  // 커서 이동 키면 입력창에 커밋되어 편집 가능. 패널별로 하나만 보관.
  pendingInputs: new Map<string, string>(),
};

// ── 렌더링 콜백 (순환 의존성 해소용) ──

type RenderFn = () => void;
let _renderSidebar: RenderFn = () => {};
let _renderContent: RenderFn = () => {};

export function setRenderCallbacks(sidebar: RenderFn, content: RenderFn): void {
  _renderSidebar = sidebar;
  _renderContent = content;
}

export function triggerSidebarRender(): void { _renderSidebar(); }
export function triggerContentRender(): void { _renderContent(); }
