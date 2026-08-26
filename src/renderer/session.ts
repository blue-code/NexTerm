/**
 * 세션 저장/복원
 */
import { state, electronAPI } from './state';
import { serializeTerminalBuffer, writeScrollbackToTerminal } from './terminal';
import { createLogger } from './logger';
import type { PanelState, SessionSnapshot, WorkspaceState } from '../shared/types';

const log = createLogger('session');

let removeSnapshotRequest: (() => void) | null = null;

/** 현재 렌더러 상태로 세션 스냅샷을 구성한다 (windowBounds는 main이 채운다) */
function buildSnapshot() {
  return {
    version: 1 as const,
    windowBounds: null as unknown as SessionSnapshot['windowBounds'],
    workspaces: state.workspaces.map(ws => ({
      ...ws,
      panels: ws.panels.map((p: PanelState) => ({
        ...p,
        // 터미널 패널: xterm 버퍼에서 스크롤백 추출 (최대 4000라인)
        scrollback: p.type === 'terminal' ? serializeTerminalBuffer(p.id) : undefined,
      })),
    })),
    activeWorkspaceId: state.activeWorkspaceId,
    sidebarWidth: state.sidebarWidth,
    sidebarVisible: state.sidebarVisible,
    savedAt: Date.now(),
  };
}

/** 세션 스냅샷 IPC 리스너 등록 (8초 주기 자동저장 요청에 응답) */
export function initSessionListeners(): void {
  removeSnapshotRequest = electronAPI.on('session:request-snapshot', () => {
    electronAPI.send('session:save', buildSnapshot());
  });
}

export function cleanupSessionListeners(): void {
  removeSnapshotRequest?.();
  removeSnapshotRequest = null;
}

let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 워크스페이스/패널 구조가 바뀌는 즉시(생성·닫기·전환·이름변경·분할 등) 호출한다.
 * 8초 주기 자동저장만으로는 그사이 앱이 갑자기 종료될 때 최신 구조를 놓칠 수 있어,
 * 짧게 디바운스해 거의 즉시 반영되도록 한다.
 */
export function requestSessionSave(): void {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    electronAPI.send('session:save', buildSnapshot());
  }, 500);
}

/** 세션 복원 시도 */
export async function restoreSession(): Promise<boolean> {
  try {
    const session = await electronAPI.invoke('session:restore') as SessionSnapshot | null;
    if (session && session.workspaces && session.workspaces.length > 0) {
      for (const wsState of session.workspaces) {
        const ws = {
          ...wsState,
          gitBranch: null,
          gitDirty: false,
          prNumber: null,
          listeningPorts: [],
          unreadNotifications: 0,
        };
        state.workspaces.push(ws);
      }
      state.activeWorkspaceId = session.activeWorkspaceId || state.workspaces[0]?.id;
      state.sidebarWidth = session.sidebarWidth || 240;
      state.sidebarVisible = session.sidebarVisible !== false;

      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.style.width = state.sidebarWidth + 'px';
      return true;
    }
  } catch (err) {
    log.warn('세션 복원 실패', err);
  }
  return false;
}
