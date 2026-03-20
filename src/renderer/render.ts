/**
 * UI 렌더링 — 사이드바, 워크스페이스 콘텐츠, 분할 패널, 브라우저 패널
 */
import { state } from './state';
import { escapeHtml } from './utils';
import {
  getActiveWorkspace,
  selectWorkspace,
  closeWorkspace,
  splitPanel,
  closePanel,
  openBrowserPanel,
  renameWorkspace,
} from './workspace';
import { createTerminalInstance, fitAllTerminals, terminalPool } from './terminal';
import { toggleTerminalSearch } from './search';
import type { SplitNode, SplitBranch } from './layout';
import type { PanelState, AppNotification } from '../../shared/types';
import type { RuntimeWorkspace } from './state';

// ── 사이드바 ──

export function renderSidebar(): void {
  const list = document.getElementById('workspace-list');
  if (!list) return;

  list.innerHTML = '';

  for (const ws of state.workspaces) {
    const tab = document.createElement('div');
    tab.className = `workspace-tab${ws.id === state.activeWorkspaceId ? ' active' : ''}`;
    if (ws.unreadNotifications > 0) tab.classList.add('has-notification');

    let metaHtml = '';
    if (ws.gitBranch) {
      metaHtml += `<span class="tab-branch">${escapeHtml(ws.gitBranch)}</span>`;
      if (ws.gitDirty) metaHtml += '<span class="tab-dirty">●</span>';
    }
    if (ws.prNumber) {
      metaHtml += `<span class="tab-pr">#${escapeHtml(String(ws.prNumber))}</span>`;
    }
    if (ws.listeningPorts.length > 0) {
      metaHtml += `<span class="tab-ports">:${escapeHtml(ws.listeningPorts.join(', :'))}</span>`;
    }

    tab.innerHTML = `
      <div class="tab-name">${escapeHtml(ws.name)}</div>
      ${metaHtml ? `<div class="tab-meta">${metaHtml}</div>` : ''}
    `;

    tab.addEventListener('click', () => selectWorkspace(ws.id));
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showWorkspaceContextMenu(ws.id, e.clientX, e.clientY);
    });

    list.appendChild(tab);
  }

  const totalUnread = state.notifications.filter((n: AppNotification) => !n.read).length;
  const badge = document.getElementById('notification-badge');
  if (badge) {
    badge.textContent = String(totalUnread);
    badge.classList.toggle('hidden', totalUnread === 0);
  }
}

// ── 워크스페이스 콘텐츠 ──

export function renderWorkspaceContent(): void {
  const container = document.getElementById('workspace-content');
  if (!container) return;

  container.querySelectorAll('.terminal-container').forEach((tc) => {
    terminalPool.appendChild(tc);
  });
  container.innerHTML = '';

  const ws = getActiveWorkspace();
  if (!ws) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:14px;">Ctrl+N으로 새 워크스페이스를 생성하세요</div>';
    return;
  }

  const element = renderSplitNode(ws.splitLayout, ws);
  container.appendChild(element);

  requestAnimationFrame(() => {
    for (const panel of ws.panels) {
      if (panel.type === 'terminal') {
        const inst = createTerminalInstance(panel.id, panel.cwd, panel.shell, panel.shellCommand);
        const mount = container.querySelector(`.term-mount[data-panel-id="${panel.id}"]`);
        if (mount && inst.container) {
          mount.appendChild(inst.container);
          inst.fitAddon.fit();
        }
      }
    }
  });
}

// ── 분할 노드 렌더링 ──

function renderSplitNode(node: SplitNode, ws: RuntimeWorkspace): HTMLElement {
  if (node.type === 'leaf') {
    const panel = ws.panels.find((p: PanelState) => p.id === node.panelId);
    if (!panel) {
      const empty = document.createElement('div');
      empty.className = 'split-pane';
      return empty;
    }
    return renderPanel(panel);
  }

  const container = document.createElement('div');
  container.className = `split-container ${node.direction}`;

  const first = renderSplitNode(node.children[0], ws);
  const second = renderSplitNode(node.children[1], ws);

  const firstSize = `${node.ratio * 100}%`;
  const secondSize = `${(1 - node.ratio) * 100}%`;

  if (node.direction === 'horizontal') {
    first.style.width = `calc(${firstSize} - 2px)`;
    first.style.height = '100%';
    second.style.width = `calc(${secondSize} - 2px)`;
    second.style.height = '100%';
  } else {
    first.style.height = `calc(${firstSize} - 2px)`;
    first.style.width = '100%';
    second.style.height = `calc(${secondSize} - 2px)`;
    second.style.width = '100%';
  }

  const handle = document.createElement('div');
  handle.className = 'split-handle';
  setupSplitHandleDrag(handle, node, container);

  container.appendChild(first);
  container.appendChild(handle);
  container.appendChild(second);

  return container;
}

// ── 패널 렌더링 ──

function renderPanel(panel: PanelState): HTMLElement {
  const pane = document.createElement('div');
  pane.className = `split-pane ${panel.id === state.focusedPanelId ? 'focused' : 'unfocused'}`;
  pane.dataset.panelId = panel.id;

  pane.addEventListener('mousedown', () => {
    state.focusedPanelId = panel.id;
    const ws = getActiveWorkspace();
    if (ws) ws.activePanelId = panel.id;
    document.querySelectorAll('.split-pane').forEach((p) => {
      const el = p as HTMLElement;
      el.classList.toggle('focused', el.dataset.panelId === panel.id);
      el.classList.toggle('unfocused', el.dataset.panelId !== panel.id);
    });
  });

  const header = document.createElement('div');
  header.className = 'panel-header';

  const typeIcons: Record<string, string> = { terminal: '▸', browser: '◎', markdown: '¶' };
  const typeLabels: Record<string, string> = { terminal: '터미널', browser: '브라우저', markdown: '마크다운' };

  const panelLabel = (() => {
    if (panel.type === 'terminal') {
      const cwd = panel.cwd || getActiveWorkspace()?.cwd || '';
      if (cwd) {
        const folderName = cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
        return folderName ? `${typeLabels[panel.type]}: ${folderName}` : typeLabels[panel.type];
      }
    }
    return panel.title || typeLabels[panel.type];
  })();

  header.innerHTML = `
    <div class="panel-title">
      <span class="panel-type-icon">${typeIcons[panel.type]}</span>
      <span class="panel-title-text">${escapeHtml(panelLabel)}</span>
    </div>
    <div class="panel-actions">
      ${panel.type === 'terminal' ? '<button class="panel-btn" data-action="search" title="검색 (Ctrl+F)">⌕</button>' : ''}
      <button class="panel-btn" data-action="split-h" title="수평 분할 (Ctrl+D)">⇥</button>
      <button class="panel-btn" data-action="split-v" title="수직 분할 (Ctrl+Shift+D)">⤓</button>
      <button class="panel-btn" data-action="close" title="닫기 (Ctrl+W)">✕</button>
    </div>
  `;

  header.querySelectorAll('.panel-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset.action;
      if (action === 'close') closePanel(panel.id);
      else if (action === 'split-h') {
        state.focusedPanelId = panel.id;
        splitPanel('horizontal');
      } else if (action === 'split-v') {
        state.focusedPanelId = panel.id;
        splitPanel('vertical');
      } else if (action === 'search') toggleTerminalSearch(panel.id);
    });
  });

  pane.appendChild(header);

  if (panel.type === 'terminal') {
    const mount = document.createElement('div');
    mount.className = 'term-mount';
    mount.dataset.panelId = panel.id;
    mount.style.width = '100%';
    mount.style.height = 'calc(100% - 28px)';
    pane.appendChild(mount);
  } else if (panel.type === 'browser') {
    renderBrowserContent(pane, panel);
  }

  return pane;
}

function renderBrowserContent(pane: HTMLElement, panel: PanelState): void {
  const browserPanel = document.createElement('div');
  browserPanel.className = 'browser-panel';

  const toolbar = document.createElement('div');
  toolbar.className = 'browser-toolbar';
  toolbar.innerHTML = `
    <button class="nav-btn" data-nav="back" title="뒤로">◀</button>
    <button class="nav-btn" data-nav="forward" title="앞으로">▶</button>
    <button class="nav-btn" data-nav="reload" title="새로고침">↻</button>
    <input type="text" class="url-input" value="${escapeHtml(panel.url || '')}" placeholder="URL 입력...">
  `;

  const webview = document.createElement('webview') as HTMLElement & {
    src: string;
    goBack(): void;
    goForward(): void;
    reload(): void;
    getTitle(): string;
  };
  webview.className = 'browser-webview';
  webview.setAttribute('src', panel.url || 'https://www.google.com');
  webview.setAttribute('allowpopups', '');

  toolbar.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nav = (btn as HTMLElement).dataset.nav;
      if (nav === 'back') webview.goBack();
      else if (nav === 'forward') webview.goForward();
      else if (nav === 'reload') webview.reload();
    });
  });

  const urlInput = toolbar.querySelector('.url-input') as HTMLInputElement;
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let url = urlInput.value.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      webview.src = url;
    }
  });

  webview.addEventListener('did-navigate', ((e: CustomEvent) => {
    urlInput.value = (e as any).url;
    panel.url = (e as any).url;
    panel.title = webview.getTitle() || '브라우저';
  }) as EventListener);

  browserPanel.appendChild(toolbar);
  browserPanel.appendChild(webview);
  pane.appendChild(browserPanel);
}

// ── 분할 핸들 드래그 ──

function setupSplitHandleDrag(handle: HTMLElement, node: SplitBranch, container: HTMLElement): void {
  let isDragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = node.direction === 'horizontal' ? 'col-resize' : 'row-resize';

    const rect = container.getBoundingClientRect();
    const first = container.children[0] as HTMLElement;
    const second = container.children[2] as HTMLElement;
    let fitTimer: ReturnType<typeof setTimeout> | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      let ratio: number;
      if (node.direction === 'horizontal') {
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        ratio = (e.clientY - rect.top) / rect.height;
      }
      node.ratio = Math.max(0.15, Math.min(0.85, ratio));

      if (node.direction === 'horizontal') {
        first.style.width = `calc(${node.ratio * 100}% - 2px)`;
        second.style.width = `calc(${(1 - node.ratio) * 100}% - 2px)`;
      } else {
        first.style.height = `calc(${node.ratio * 100}% - 2px)`;
        second.style.height = `calc(${(1 - node.ratio) * 100}% - 2px)`;
      }

      if (!fitTimer) {
        fitTimer = setTimeout(() => {
          fitAllTerminals();
          fitTimer = null;
        }, 16);
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      if (fitTimer) { clearTimeout(fitTimer); fitTimer = null; }
      fitAllTerminals();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ── 컨텍스트 메뉴 + 이름 변경 ──

function showWorkspaceContextMenu(workspaceId: string, x: number, y: number): void {
  document.querySelectorAll('.context-menu').forEach((m) => m.remove());

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = `
    position: fixed; left: ${x}px; top: ${y}px; z-index: 2000;
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: 8px; padding: 4px 0; min-width: 160px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  `;

  const items = [
    { label: '이름 변경', action: () => promptRenameWorkspace(workspaceId) },
    { label: '새 터미널 분할', action: () => { selectWorkspace(workspaceId); splitPanel('horizontal'); } },
    { label: '브라우저 열기', action: () => { selectWorkspace(workspaceId); openBrowserPanel(); } },
    { label: '닫기', action: () => closeWorkspace(workspaceId) },
  ];

  for (const item of items) {
    const el = document.createElement('div');
    el.style.cssText = 'padding: 8px 14px; cursor: pointer; font-size: 13px;';
    el.textContent = item.label;
    el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-hover)');
    el.addEventListener('mouseleave', () => el.style.background = '');
    el.addEventListener('click', () => { menu.remove(); item.action(); });
    menu.appendChild(el);
  }

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 10);
}

export function promptRenameWorkspace(wsId?: string): void {
  const id = wsId || state.activeWorkspaceId;
  const ws = state.workspaces.find(w => w.id === id);
  if (!ws) return;

  const palette = document.getElementById('command-palette')!;
  palette.classList.remove('hidden');
  const input = document.getElementById('palette-input') as HTMLInputElement;
  input.value = ws.name;
  input.placeholder = '새 이름 입력...';
  input.select();

  const results = document.getElementById('palette-results')!;
  results.innerHTML = '<div style="padding:12px 18px;color:var(--text-secondary);font-size:13px;">Enter로 확인, Esc로 취소</div>';

  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      renameWorkspace(id!, input.value.trim() || ws.name);
      palette.classList.add('hidden');
      input.removeEventListener('keydown', handler);
      input.placeholder = '명령 검색...';
    } else if (e.key === 'Escape') {
      palette.classList.add('hidden');
      input.removeEventListener('keydown', handler);
      input.placeholder = '명령 검색...';
    }
  };
  input.addEventListener('keydown', handler);
}
