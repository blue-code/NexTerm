/**
 * 세션 저장/복원
 */
import { state, electronAPI } from './state';
import { serializeTerminalBuffer, writeScrollbackToTerminal } from './terminal';
import { createLogger } from './logger';
import type { PanelState, SessionSnapshot, WorkspaceState } from '../../shared/types';

const log = createLogger('session');

let removeSnapshotRequest: (() => void) | null = null;

/** 세션 스냅샷 IPC 리스너 등록 */
export function initSessionListeners(): void {
  removeSnapshotRequest = electronAPI.on('session:request-snapshot', () => {
    const snapshot = {
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
    electronAPI.send('session:save', snapshot);
  });
}

export function cleanupSessionListeners(): void {
  removeSnapshotRequest?.();
  removeSnapshotRequest = null;
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
