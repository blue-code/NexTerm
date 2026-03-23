/**
 * 워크스페이스 + 패널 관리
 * CRUD 연산과 분할/닫기 동작을 담당한다.
 */
import { state, electronAPI, triggerSidebarRender, triggerContentRender, type RuntimeWorkspace } from './state';
import { generateId } from './utils';
import { splitNodeAt, removeNodeFrom, type SplitNode } from './layout';
import { destroyTerminal } from './terminal';
import type { PanelState } from '../../shared/types';

// IPC 리스너 해제 함수
let removeChildDetected: (() => void) | null = null;

// ── 워크스페이스 CRUD ──

export function createWorkspace(name?: string, cwd?: string): RuntimeWorkspace {
  const id = generateId();
  const panelId = generateId();
  const workspace: RuntimeWorkspace = {
    id,
    name: name || `워크스페이스 ${state.workspaces.length + 1}`,
    panels: [{ id: panelId, type: 'terminal', title: '터미널', cwd: cwd || '' }],
    splitLayout: { type: 'leaf', panelId } as SplitNode,
    activePanelId: panelId,
    cwd: cwd || electronAPI.env.USERPROFILE,
    gitBranch: null,
    gitDirty: false,
    prNumber: null,
    listeningPorts: [],
    unreadNotifications: 0,
    createdAt: Date.now(),
  };
  state.workspaces.push(workspace);
  state.focusedPanelId = panelId;
  selectWorkspace(id);
  triggerSidebarRender();
  return workspace;
}

export function selectWorkspace(id: string): void {
  state.activeWorkspaceId = id;
  triggerSidebarRender();
  triggerContentRender();
}

export function closeWorkspace(id: string): void {
  const ws = state.workspaces.find(w => w.id === id);
  if (!ws) return;

  for (const panel of ws.panels) {
    if (panel.type === 'terminal') {
      destroyTerminal(panel.id);
    }
  }

  state.workspaces = state.workspaces.filter(w => w.id !== id);

  if (state.activeWorkspaceId === id) {
    state.activeWorkspaceId = state.workspaces.length > 0
      ? state.workspaces[0].id
      : null;
  }

  if (state.workspaces.length === 0) {
    createWorkspace();
  } else {
    triggerSidebarRender();
    triggerContentRender();
  }
}

export function renameWorkspace(id: string, newName: string): void {
  const ws = state.workspaces.find(w => w.id === id);
  if (ws) {
    ws.name = newName;
    triggerSidebarRender();
  }
}

export function getActiveWorkspace(): RuntimeWorkspace | undefined {
  return state.workspaces.find(w => w.id === state.activeWorkspaceId);
}

// ── 패널 분할/닫기 ──

export function splitPanel(
  direction: 'horizontal' | 'vertical',
  opts: { cwd?: string; shell?: string } = {},
): void {
  const ws = getActiveWorkspace();
  if (!ws) return;

  const targetPanelId = state.focusedPanelId || ws.activePanelId;
  if (!targetPanelId) return;

  const targetPanel = ws.panels.find((p: PanelState) => p.id === targetPanelId);
  const newPanelId = generateId();
  const newPanel: PanelState = {
    id: newPanelId,
    type: 'terminal',
    title: '터미널',
    cwd: opts.cwd || targetPanel?.cwd || ws.cwd,
    shell: opts.shell || undefined,
  };
  ws.panels.push(newPanel);

  ws.splitLayout = splitNodeAt(ws.splitLayout, targetPanelId, newPanelId, direction);
  ws.activePanelId = newPanelId;
  state.focusedPanelId = newPanelId;

  triggerContentRender();
}

export function closePanel(panelId: string): void {
  const ws = getActiveWorkspace();
  if (!ws) return;

  if (ws.panels.length <= 1) {
    closeWorkspace(ws.id);
    return;
  }

  const closingPanel = ws.panels.find((p: PanelState) => p.id === panelId);
  if (closingPanel?.type === 'terminal') {
    destroyTerminal(panelId);
  } else if (closingPanel?.type === 'browser' && closingPanel.url) {
    // 닫은 브라우저 탭을 스택에 저장 (최대 20개)
    state.closedBrowserTabs.push({
      url: closingPanel.url,
      title: closingPanel.title,
      browserProfile: closingPanel.browserProfile,
      closedAt: Date.now(),
    });
    if (state.closedBrowserTabs.length > 20) {
      state.closedBrowserTabs.shift();
    }
  }

  ws.panels = ws.panels.filter((p: PanelState) => p.id !== panelId);
  ws.splitLayout = removeNodeFrom(ws.splitLayout, panelId);

  if (ws.activePanelId === panelId || state.focusedPanelId === panelId) {
    ws.activePanelId = ws.panels[0]?.id || null;
    state.focusedPanelId = ws.activePanelId;
  }

  triggerContentRender();
}

// ── 브라우저 패널 ──

export function openBrowserPanel(url?: string): void {
  const ws = getActiveWorkspace();
  if (!ws) return;

  const panelId = generateId();
  const panel: PanelState = {
    id: panelId,
    type: 'browser',
    title: '브라우저',
    url: url || 'https://www.google.com',
  };
  ws.panels.push(panel);

  const targetPanelId = state.focusedPanelId || ws.activePanelId;
  if (targetPanelId) {
    ws.splitLayout = splitNodeAt(ws.splitLayout, targetPanelId, panelId, 'horizontal');
  }

  state.focusedPanelId = panelId;
  ws.activePanelId = panelId;
  triggerContentRender();
}

/** 포커스된 패널 줌/최대화 토글 */
export function togglePanelZoom(): void {
  if (state.zoomedPanelId) {
    // 줌 해제
    state.zoomedPanelId = null;
  } else if (state.focusedPanelId) {
    state.zoomedPanelId = state.focusedPanelId;
  }
  triggerContentRender();
}

/** 마크다운 뷰어 패널 열기 */
export function openMarkdownPanel(filePath: string): void {
  const ws = getActiveWorkspace();
  if (!ws) return;

  const panelId = generateId();
  const fileName = filePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Markdown';
  const panel: PanelState = {
    id: panelId,
    type: 'markdown',
    title: fileName,
    filePath,
  };
  ws.panels.push(panel);

  const targetPanelId = state.focusedPanelId || ws.activePanelId;
  if (targetPanelId) {
    ws.splitLayout = splitNodeAt(ws.splitLayout, targetPanelId, panelId, 'horizontal');
  }

  state.focusedPanelId = panelId;
  ws.activePanelId = panelId;
  triggerContentRender();
}

/** 닫은 브라우저 탭 복원 (Ctrl+Shift+T) */
export function restoreClosedBrowserTab(): void {
  const tab = state.closedBrowserTabs.pop();
  if (!tab) return;
  openBrowserPanel(tab.url);
}

// ── 네비게이션 ──

export function cycleWorkspace(direction: number): void {
  if (state.workspaces.length <= 1) return;
  const idx = state.workspaces.findIndex(w => w.id === state.activeWorkspaceId);
  const next = (idx + direction + state.workspaces.length) % state.workspaces.length;
  selectWorkspace(state.workspaces[next].id);
}

export function focusAdjacentPanel(direction: number): void {
  const ws = getActiveWorkspace();
  if (!ws || ws.panels.length <= 1) return;

  const idx = ws.panels.findIndex((p: PanelState) => p.id === state.focusedPanelId);
  const next = (idx + direction + ws.panels.length) % ws.panels.length;
  state.focusedPanelId = ws.panels[next].id;
  ws.activePanelId = ws.panels[next].id;

  document.querySelectorAll('.split-pane').forEach((p: Element) => {
    const el = p as HTMLElement;
    el.classList.toggle('focused', el.dataset.panelId === state.focusedPanelId);
    el.classList.toggle('unfocused', el.dataset.panelId !== state.focusedPanelId);
  });

  const instance = state.terminalInstances.get(state.focusedPanelId!);
  if (instance) instance.terminal.focus();
}

// ── 자식 프로세스 감지 IPC ──

export function initChildDetectListener(): void {
  removeChildDetected = electronAPI.on('terminal:child-detected', (payload: unknown) => {
    const { commandLine } = payload as { commandLine: string };
    const ws = getActiveWorkspace();
    if (!ws) return;

    const newPanelId = generateId();
    const activePanel = ws.panels.find(
      (p: PanelState) => p.id === (state.focusedPanelId || ws.activePanelId),
    );
    const newPanel: PanelState = {
      id: newPanelId,
      type: 'terminal',
      title: '터미널',
      cwd: activePanel?.cwd || ws.cwd,
      shellCommand: commandLine,
    };
    ws.panels.push(newPanel);

    const targetPanelId = state.focusedPanelId || ws.activePanelId;
    if (targetPanelId) {
      ws.splitLayout = splitNodeAt(ws.splitLayout, targetPanelId, newPanelId, 'horizontal');
    }
    ws.activePanelId = newPanelId;
    state.focusedPanelId = newPanelId;
    triggerContentRender();
  });
}

export function cleanupChildDetectListener(): void {
  removeChildDetected?.();
  removeChildDetected = null;
}
