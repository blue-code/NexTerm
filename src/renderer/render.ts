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
import { createTerminalInstance, fitAllTerminals, fitAllTerminalsImmediate, fitTerminal, terminalPool } from './terminal';
import { toggleTerminalSearch } from './search';
import type { SplitNode, SplitBranch } from './layout';
import { getWorkspaceAgentStatus } from './agent-indicator';
import { createOmnibar } from './omnibar';
import { createMarkdownViewer } from './markdown-viewer';
import type { PanelState } from '../../shared/types';
import type { RuntimeWorkspace } from './state';

// ── 사이드바 ──

export function renderSidebar(): void {
  const list = document.getElementById('workspace-list');
  if (!list) return;

  list.innerHTML = '';

  for (const ws of state.workspaces) {
    const tab = document.createElement('div');
    tab.className = `workspace-tab${ws.id === state.activeWorkspaceId ? ' active' : ''}`;
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

    // AI 에이전트 상태 표시
    const agentStatus = getWorkspaceAgentStatus(ws.id);
    let agentStatusHtml = '';
    if (agentStatus.hasActive) {
      // 하나라도 작업 중이면 "작업 중" 우선 표시
      tab.classList.add('agent-working');
      agentStatusHtml = `<div class="tab-agent-status tab-agent-status-active">
        <span class="agent-status-dot active"></span>
        <span class="agent-status-text">${escapeHtml(agentStatus.agentName || 'AI')} 작업 중</span>
      </div>`;
    } else if (agentStatus.hasCompleted) {
      // 모든 에이전트가 완료된 경우에만 "완료" 표시
      tab.classList.add('agent-done');
      agentStatusHtml = `<div class="tab-agent-status tab-agent-status-completed">
        <span class="agent-status-dot completed"></span>
        <span class="agent-status-text">${escapeHtml(agentStatus.agentName || 'AI')} 완료</span>
      </div>`;
    }

    tab.innerHTML = `
      <div class="tab-name">${escapeHtml(ws.name)}</div>
      ${metaHtml ? `<div class="tab-meta">${metaHtml}</div>` : ''}
      ${agentStatusHtml}
    `;

    // 워크스페이스 색상 적용
    if (ws.color) {
      tab.style.borderLeft = `3px solid ${ws.color}`;
    }

    tab.addEventListener('click', () => selectWorkspace(ws.id));
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showWorkspaceContextMenu(ws.id, e.clientX, e.clientY);
    });

    list.appendChild(tab);
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

  // 줌 모드: 특정 패널만 전체 크기로 표시
  if (state.zoomedPanelId) {
    const zoomedPanel = ws.panels.find((p: PanelState) => p.id === state.zoomedPanelId);
    if (zoomedPanel) {
      const element = renderPanel(zoomedPanel);
      element.style.width = '100%';
      element.style.height = '100%';
      container.appendChild(element);
    } else {
      // 줌된 패널이 없으면 줌 해제
      state.zoomedPanelId = null;
      const element = renderSplitNode(ws.splitLayout, ws);
      container.appendChild(element);
    }
  } else {
    const element = renderSplitNode(ws.splitLayout, ws);
    container.appendChild(element);
  }

  // 터미널 마운트: 스크롤 위치를 보존하면서 DOM에 재배치
  requestAnimationFrame(() => {
    for (const panel of ws.panels) {
      if (panel.type === 'terminal') {
        const inst = createTerminalInstance(panel.id, panel.cwd, panel.shell, panel.shellCommand, panel.scrollback);
        const mount = container.querySelector(`.term-mount[data-panel-id="${panel.id}"]`);
        if (mount && inst.container) {
          // 마운트 전 스크롤 상태 저장
          const term = inst.terminal;
          const savedViewportY = term.buffer.active.viewportY;
          const wasAtBottom = savedViewportY >= term.buffer.active.baseY;

          mount.appendChild(inst.container);
          fitTerminal(inst);

          // display:none → visible 전환 후 스크롤 위치 복원
          if (!wasAtBottom && term.buffer.active.baseY > 0) {
            term.scrollToLine(savedViewportY);
          }
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

  const focusPanel = () => {
    state.focusedPanelId = panel.id;
    const ws = getActiveWorkspace();
    if (ws) ws.activePanelId = panel.id;
    document.querySelectorAll('.split-pane').forEach((p) => {
      const el = p as HTMLElement;
      el.classList.toggle('focused', el.dataset.panelId === panel.id);
      el.classList.toggle('unfocused', el.dataset.panelId !== panel.id);
    });
  };

  pane.addEventListener('mousedown', focusPanel);

  // Focus-follows-mouse: 마우스 hover 시 자동 포커스
  pane.addEventListener('mouseenter', () => {
    if (state.focusFollowsMouse) {
      focusPanel();
      // 터미널 패널이면 터미널에 포커스
      const inst = state.terminalInstances.get(panel.id);
      if (inst) inst.terminal.focus();
    }
  });

  const header = document.createElement('div');
  header.className = 'panel-header';

  const typeIcons: Record<string, string> = { terminal: '▸', browser: '◎', markdown: '¶' };
  const typeLabels: Record<string, string> = { terminal: '터미널', browser: '브라우저', markdown: '마크다운' };

  // Vim 모드 배지: 터미널 제목에 vim/nvim이 포함되면 표시
  const isVimActive = panel.type === 'terminal' && panel.title && /\b(n?vim)\b/i.test(panel.title);

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
      ${isVimActive ? '<span class="vim-badge">VIM</span>' : ''}
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
  } else if (panel.type === 'markdown' && panel.filePath) {
    createMarkdownViewer(pane, panel.id, panel.filePath);
  }

  return pane;
}

function renderBrowserContent(pane: HTMLElement, panel: PanelState): void {
  const browserPanel = document.createElement('div');
  browserPanel.className = 'browser-panel';

  const toolbar = document.createElement('div');
  toolbar.className = 'browser-toolbar';

  // 네비게이션 버튼
  const navBtns = document.createElement('div');
  navBtns.className = 'browser-nav-btns';
  navBtns.innerHTML = `
    <button class="nav-btn" data-nav="back" title="뒤로">◀</button>
    <button class="nav-btn" data-nav="forward" title="앞으로">▶</button>
    <button class="nav-btn" data-nav="reload" title="새로고침">↻</button>
  `;
  toolbar.appendChild(navBtns);

  // Omnibar (히스토리 자동완성 + 검색엔진 통합)
  const webview = document.createElement('webview') as HTMLElement & {
    src: string;
    goBack(): void;
    goForward(): void;
    reload(): void;
    getTitle(): string;
    openDevTools(): void;
    findInPage(text: string, opts?: { forward?: boolean }): void;
    stopFindInPage(action: string): void;
  };

  const omnibar = createOmnibar(toolbar, panel.url || '', (url) => {
    webview.src = url;
  });

  // 도구 버튼 (Find-in-page, DevTools)
  const toolBtns = document.createElement('div');
  toolBtns.className = 'browser-tool-btns';
  toolBtns.innerHTML = `
    <button class="nav-btn" data-action="find" title="페이지 내 검색 (Ctrl+F)">⌕</button>
    <button class="nav-btn" data-action="devtools" title="개발자 도구">⚙</button>
  `;
  toolbar.appendChild(toolBtns);

  // webview 설정
  webview.className = 'browser-webview';
  webview.setAttribute('src', panel.url || 'https://www.google.com');
  webview.setAttribute('allowpopups', '');

  // 브라우저 프로필 (partition으로 데이터 격리)
  const profile = panel.browserProfile || 'default';
  webview.setAttribute('partition', `persist:browser-${profile}`);

  // 네비게이션 버튼 이벤트
  navBtns.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nav = (btn as HTMLElement).dataset.nav;
      if (nav === 'back') webview.goBack();
      else if (nav === 'forward') webview.goForward();
      else if (nav === 'reload') webview.reload();
    });
  });

  // URL 변경 시 Omnibar 갱신 + 히스토리 기록
  webview.addEventListener('did-navigate', ((e: CustomEvent) => {
    const url = (e as any).url as string;
    omnibar.updateUrl(url);
    panel.url = url;
    const title = webview.getTitle() || '브라우저';
    panel.title = title;
    // 히스토리 기록 (about:blank 등 제외)
    if (url && !url.startsWith('about:')) {
      import('./state').then(({ electronAPI }) => {
        electronAPI.send('browser:history-add', { url, title });
      });
    }
  }) as EventListener);

  webview.addEventListener('did-navigate-in-page', ((e: CustomEvent) => {
    const url = (e as any).url as string;
    if (url) omnibar.updateUrl(url);
  }) as EventListener);

  // Find-in-page 오버레이
  const findOverlay = document.createElement('div');
  findOverlay.className = 'browser-find-overlay hidden';
  findOverlay.innerHTML = `
    <input type="text" class="browser-find-input" placeholder="페이지에서 찾기...">
    <button class="nav-btn find-prev" title="이전">▲</button>
    <button class="nav-btn find-next" title="다음">▼</button>
    <button class="nav-btn find-close" title="닫기">✕</button>
  `;

  const findInput = findOverlay.querySelector('.browser-find-input') as HTMLInputElement;
  findInput.addEventListener('input', () => {
    const text = findInput.value;
    if (text) webview.findInPage(text);
    else webview.stopFindInPage('clearSelection');
  });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      webview.findInPage(findInput.value, { forward: !e.shiftKey });
    } else if (e.key === 'Escape') {
      webview.stopFindInPage('clearSelection');
      findOverlay.classList.add('hidden');
    }
  });
  findOverlay.querySelector('.find-prev')?.addEventListener('click', () => {
    webview.findInPage(findInput.value, { forward: false });
  });
  findOverlay.querySelector('.find-next')?.addEventListener('click', () => {
    webview.findInPage(findInput.value, { forward: true });
  });
  findOverlay.querySelector('.find-close')?.addEventListener('click', () => {
    webview.stopFindInPage('clearSelection');
    findOverlay.classList.add('hidden');
  });

  // 도구 버튼 이벤트
  toolBtns.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (action === 'find') {
        findOverlay.classList.toggle('hidden');
        if (!findOverlay.classList.contains('hidden')) {
          findInput.focus();
          findInput.select();
        }
      } else if (action === 'devtools') {
        webview.openDevTools();
      }
    });
  });

  browserPanel.appendChild(toolbar);
  browserPanel.appendChild(findOverlay);
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
        }, 80);
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      if (fitTimer) { clearTimeout(fitTimer); fitTimer = null; }
      fitAllTerminalsImmediate();
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
    { label: '색상 설정', action: () => promptWorkspaceColor(workspaceId) },
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

/** 워크스페이스 색상 설정 (색상 피커 팝업) */
function promptWorkspaceColor(wsId: string): void {
  const ws = state.workspaces.find(w => w.id === wsId);
  if (!ws) return;

  const presetColors = [
    '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7',
    '#7dcfff', '#ff9e64', '#f5c2e7', '#a6e3a1', '#fab387',
    '', // 색상 없음 (제거)
  ];

  // 간단한 색상 선택 팝업
  const popup = document.createElement('div');
  popup.className = 'color-picker-popup';
  popup.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 2000; background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: 12px; padding: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  `;

  popup.innerHTML = `
    <div style="font-size:13px;margin-bottom:12px;color:var(--text-secondary)">워크스페이스 색상</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;max-width:220px"></div>
  `;

  const grid = popup.querySelector('div:last-child')!;
  for (const color of presetColors) {
    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 32px; height: 32px; border-radius: 6px; cursor: pointer;
      border: 2px solid ${ws.color === color ? 'var(--accent)' : 'transparent'};
      ${color ? `background: ${color}` : 'background: var(--bg-tertiary); display:flex; align-items:center; justify-content:center; font-size:14px;'}
    `;
    if (!color) swatch.textContent = '✕';

    swatch.addEventListener('click', () => {
      ws.color = color || undefined;
      renderSidebar();
      popup.remove();
      backdrop.remove();
    });
    grid.appendChild(swatch);
  }

  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:1999;';
  backdrop.addEventListener('click', () => { popup.remove(); backdrop.remove(); });

  document.body.appendChild(backdrop);
  document.body.appendChild(popup);
}
