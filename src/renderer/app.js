/**
 * NexTerm 렌더러 프로세스 - 메인 앱 로직
 * 워크스페이스, 분할 패널, 터미널, 브라우저, 커맨드 팔레트를 관리한다.
 */
const { ipcRenderer } = require('electron');
const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { WebglAddon } = require('@xterm/addon-webgl');
const { SearchAddon } = require('@xterm/addon-search');

// ── 상태 관리 ──

const state = {
  workspaces: [],           // WorkspaceState[]
  activeWorkspaceId: null,
  notifications: [],        // AppNotification[]
  settings: null,
  sidebarWidth: 240,
  sidebarVisible: true,
  terminalInstances: new Map(), // panelId → { terminal, fitAddon, searchAddon, container }
  focusedPanelId: null,
  defaultShell: 'powershell.exe',
};

// 터미널 DOM 컨테이너 풀 — 레이아웃 재렌더 시에도 터미널 DOM을 파괴하지 않고 보존
const terminalPool = document.createElement('div');
terminalPool.id = 'terminal-pool';
terminalPool.style.display = 'none';
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(terminalPool));

// ── 유틸리티 ──

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

// ── 워크스페이스 관리 ──

function createWorkspace(name, cwd) {
  const id = generateId();
  const panelId = generateId();
  const workspace = {
    id,
    name: name || `워크스페이스 ${state.workspaces.length + 1}`,
    panels: [{ id: panelId, type: 'terminal', title: '터미널', cwd: cwd || '' }],
    splitLayout: { type: 'leaf', panelId },
    activePanelId: panelId,
    cwd: cwd || process.env.USERPROFILE || 'C:\\',
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
  renderSidebar();
  return workspace;
}

function selectWorkspace(id) {
  state.activeWorkspaceId = id;
  renderSidebar();
  renderWorkspaceContent();
}

function closeWorkspace(id) {
  const ws = state.workspaces.find(w => w.id === id);
  if (!ws) return;

  // 모든 터미널 종료
  for (const panel of ws.panels) {
    if (panel.type === 'terminal') {
      destroyTerminal(panel.id);
    }
  }

  state.workspaces = state.workspaces.filter(w => w.id !== id);

  // 다른 워크스페이스로 전환
  if (state.activeWorkspaceId === id) {
    state.activeWorkspaceId = state.workspaces.length > 0
      ? state.workspaces[0].id
      : null;
  }

  if (state.workspaces.length === 0) {
    createWorkspace();
  } else {
    renderSidebar();
    renderWorkspaceContent();
  }
}

function renameWorkspace(id, newName) {
  const ws = state.workspaces.find(w => w.id === id);
  if (ws) {
    ws.name = newName;
    renderSidebar();
  }
}

function getActiveWorkspace() {
  return state.workspaces.find(w => w.id === state.activeWorkspaceId);
}

// ── 패널 분할 ──

function splitPanel(direction) {
  const ws = getActiveWorkspace();
  if (!ws) return;

  const targetPanelId = state.focusedPanelId || ws.activePanelId;
  if (!targetPanelId) return;

  const newPanelId = generateId();
  const newPanel = {
    id: newPanelId,
    type: 'terminal',
    title: '터미널',
    cwd: ws.cwd,
  };
  ws.panels.push(newPanel);

  // 레이아웃 트리에서 대상 리프를 분할 노드로 교체
  ws.splitLayout = splitNodeAt(ws.splitLayout, targetPanelId, newPanelId, direction);
  ws.activePanelId = newPanelId;
  state.focusedPanelId = newPanelId;

  renderWorkspaceContent();
}

function splitNodeAt(node, targetId, newId, direction) {
  if (node.type === 'leaf') {
    if (node.panelId === targetId) {
      return {
        type: 'branch',
        direction,
        ratio: 0.5,
        children: [
          { type: 'leaf', panelId: targetId },
          { type: 'leaf', panelId: newId },
        ],
      };
    }
    return node;
  }
  return {
    ...node,
    children: [
      splitNodeAt(node.children[0], targetId, newId, direction),
      splitNodeAt(node.children[1], targetId, newId, direction),
    ],
  };
}

function closePanel(panelId) {
  const ws = getActiveWorkspace();
  if (!ws) return;

  // 마지막 패널이면 워크스페이스 닫기
  if (ws.panels.length <= 1) {
    closeWorkspace(ws.id);
    return;
  }

  if (ws.panels.find(p => p.id === panelId)?.type === 'terminal') {
    destroyTerminal(panelId);
  }

  ws.panels = ws.panels.filter(p => p.id !== panelId);
  ws.splitLayout = removeNodeFrom(ws.splitLayout, panelId);

  if (ws.activePanelId === panelId || state.focusedPanelId === panelId) {
    ws.activePanelId = ws.panels[0]?.id || null;
    state.focusedPanelId = ws.activePanelId;
  }

  renderWorkspaceContent();
}

function removeNodeFrom(node, panelId) {
  if (node.type === 'leaf') {
    return node;
  }
  const [left, right] = node.children;
  // 자식 중 하나가 제거 대상이면 나머지를 승격
  if (left.type === 'leaf' && left.panelId === panelId) return right;
  if (right.type === 'leaf' && right.panelId === panelId) return left;
  return {
    ...node,
    children: [
      removeNodeFrom(left, panelId),
      removeNodeFrom(right, panelId),
    ],
  };
}

// ── 브라우저 패널 ──

function openBrowserPanel(url) {
  const ws = getActiveWorkspace();
  if (!ws) return;

  const panelId = generateId();
  const panel = {
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
  renderWorkspaceContent();
}

// ── 터미널 관리 ──

function createTerminalInstance(panelId, cwd) {
  // 이미 존재하면 재생성하지 않음
  if (state.terminalInstances.has(panelId)) return state.terminalInstances.get(panelId);

  // 전용 컨테이너 생성 (풀에 보관, 레이아웃 변경 시 이동만)
  const container = document.createElement('div');
  container.className = 'terminal-container';
  container.dataset.termPanelId = panelId;
  terminalPool.appendChild(container);

  const terminal = new Terminal({
    fontFamily: state.settings?.fontFamily || 'Cascadia Code, Consolas, monospace',
    fontSize: state.settings?.fontSize || 14,
    scrollback: state.settings?.scrollbackLimit || 10000,
    cursorBlink: true,
    cursorStyle: 'bar',
    theme: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      cursor: '#c0caf5',
      selectionBackground: '#33467c',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5',
    },
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);

  terminal.open(container);

  // WebGL 렌더러 시도 (GPU 가속)
  try {
    const webglAddon = new WebglAddon();
    terminal.loadAddon(webglAddon);
    webglAddon.onContextLoss(() => webglAddon.dispose());
  } catch {
    // WebGL 미지원 시 Canvas 폴백 (기본)
  }

  // 앱 단축키를 xterm보다 먼저 처리 — false 반환 시 xterm이 해당 키를 무시
  terminal.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    const ctrl = e.ctrlKey;
    const shift = e.shiftKey;
    const key = e.key;
    // 앱 단축키 목록: xterm에 전달하지 않고 document 핸들러에서 처리
    if (ctrl && shift && key === 'P') return false;
    if (ctrl && !shift && key === 'n') return false;
    if (ctrl && !shift && key === 'w') return false;
    if (ctrl && shift && key === 'W') return false;
    if (ctrl && !shift && key === 'd') return false;
    if (ctrl && shift && key === 'D') return false;
    if (ctrl && !shift && key === 'b') return false;
    if (ctrl && shift && key === 'B') return false;
    if (ctrl && !shift && key === 'f') return false;
    if (ctrl && key === 'Tab') return false;
    if (ctrl && key === ']') return false;
    if (ctrl && key === '[') return false;
    if (ctrl && shift && key === 'U') return false;
    return true; // 나머지는 xterm에 전달
  });

  // 메인 프로세스에 터미널 생성 요청
  ipcRenderer.invoke('terminal:create', {
    id: panelId,
    cwd: cwd || state.settings?.defaultCwd || process.env.USERPROFILE,
    shell: state.defaultShell,
  });

  // 키 입력 → 메인 프로세스
  terminal.onData((data) => {
    ipcRenderer.send('terminal:input', { id: panelId, data });
  });

  // 리사이즈 → 메인 프로세스
  terminal.onResize(({ cols, rows }) => {
    ipcRenderer.send('terminal:resize', { id: panelId, cols, rows });
  });

  const inst = { terminal, fitAddon, searchAddon, container };
  state.terminalInstances.set(panelId, inst);
  return inst;
}

function destroyTerminal(panelId) {
  const instance = state.terminalInstances.get(panelId);
  if (instance) {
    instance.terminal.dispose();
    instance.container.remove();
    state.terminalInstances.delete(panelId);
    ipcRenderer.send('terminal:close', { id: panelId });
  }
}

// 메인 프로세스에서 터미널 출력 수신
ipcRenderer.on('terminal:data', (_event, { id, data }) => {
  const instance = state.terminalInstances.get(id);
  if (instance) {
    instance.terminal.write(data);
  }
});

// 터미널 종료 이벤트
ipcRenderer.on('terminal:close', (_event, { id, exitCode }) => {
  const ws = getActiveWorkspace();
  if (ws) {
    const panel = ws.panels.find(p => p.id === id);
    if (panel) {
      // 종료 코드 표시 후 패널 유지 (사용자가 수동으로 닫도록)
      const instance = state.terminalInstances.get(id);
      if (instance) {
        instance.terminal.writeln(`\r\n\x1b[90m[프로세스 종료, 코드: ${exitCode}]\x1b[0m`);
      }
    }
  }
});

// ── UI 렌더링 ──

function renderSidebar() {
  const list = document.getElementById('workspace-list');
  if (!list) return;

  list.innerHTML = '';

  for (const ws of state.workspaces) {
    const tab = document.createElement('div');
    tab.className = `workspace-tab${ws.id === state.activeWorkspaceId ? ' active' : ''}`;
    if (ws.unreadNotifications > 0) tab.classList.add('has-notification');

    let metaHtml = '';
    if (ws.gitBranch) {
      metaHtml += `<span class="tab-branch">${ws.gitBranch}</span>`;
      if (ws.gitDirty) metaHtml += '<span class="tab-dirty">●</span>';
    }
    if (ws.prNumber) {
      metaHtml += `<span class="tab-pr">#${ws.prNumber}</span>`;
    }
    if (ws.listeningPorts.length > 0) {
      metaHtml += `<span class="tab-ports">:${ws.listeningPorts.join(', :')}</span>`;
    }

    tab.innerHTML = `
      <div class="tab-name">${escapeHtml(ws.name)}</div>
      ${metaHtml ? `<div class="tab-meta">${metaHtml}</div>` : ''}
    `;

    tab.addEventListener('click', () => selectWorkspace(ws.id));

    // 우클릭 메뉴 (이름 변경, 닫기)
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showWorkspaceContextMenu(ws.id, e.clientX, e.clientY);
    });

    list.appendChild(tab);
  }

  // 알림 배지 업데이트
  const totalUnread = state.notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notification-badge');
  if (badge) {
    badge.textContent = String(totalUnread);
    badge.classList.toggle('hidden', totalUnread === 0);
  }
}

function renderWorkspaceContent() {
  const container = document.getElementById('workspace-content');
  if (!container) return;

  // 기존 터미널 컨테이너를 풀로 회수 (DOM에서 제거하지 않고 이동만)
  container.querySelectorAll('.terminal-container').forEach(tc => {
    terminalPool.appendChild(tc);
  });
  container.innerHTML = '';

  const ws = getActiveWorkspace();
  if (!ws) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:14px;">Ctrl+N으로 새 워크스페이스를 생성하세요</div>';
    return;
  }

  // 분할 레이아웃 렌더링
  const element = renderSplitNode(ws.splitLayout, ws);
  container.appendChild(element);

  // 터미널 생성 + 컨테이너 배치 + fit (DOM이 확정된 후 처리)
  requestAnimationFrame(() => {
    for (const panel of ws.panels) {
      if (panel.type === 'terminal') {
        // 인스턴스가 없으면 생성
        const inst = createTerminalInstance(panel.id, panel.cwd);
        // 해당 패널의 마운트 포인트에 컨테이너 이동
        const mount = container.querySelector(`.term-mount[data-panel-id="${panel.id}"]`);
        if (mount && inst.container) {
          mount.appendChild(inst.container);
          inst.fitAddon.fit();
        }
      }
    }
  });
}

function renderSplitNode(node, ws) {
  if (node.type === 'leaf') {
    const panel = ws.panels.find(p => p.id === node.panelId);
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

  // 비율 적용
  const firstSize = `${node.ratio * 100}%`;
  const secondSize = `${(1 - node.ratio) * 100}%`;

  if (node.direction === 'horizontal') {
    first.style.width = `calc(${firstSize} - ${2}px)`;
    first.style.height = '100%';
    second.style.width = `calc(${secondSize} - ${2}px)`;
    second.style.height = '100%';
  } else {
    first.style.height = `calc(${firstSize} - ${2}px)`;
    first.style.width = '100%';
    second.style.height = `calc(${secondSize} - ${2}px)`;
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

function renderPanel(panel) {
  const pane = document.createElement('div');
  pane.className = `split-pane ${panel.id === state.focusedPanelId ? 'focused' : 'unfocused'}`;
  pane.dataset.panelId = panel.id;

  // 포커스 처리
  pane.addEventListener('mousedown', () => {
    state.focusedPanelId = panel.id;
    const ws = getActiveWorkspace();
    if (ws) ws.activePanelId = panel.id;
    document.querySelectorAll('.split-pane').forEach(p => {
      p.classList.toggle('focused', p.dataset.panelId === panel.id);
      p.classList.toggle('unfocused', p.dataset.panelId !== panel.id);
    });
  });

  // 패널 헤더
  const header = document.createElement('div');
  header.className = 'panel-header';

  const typeIcons = { terminal: '▸', browser: '◎', markdown: '¶' };
  const typeLabels = { terminal: '터미널', browser: '브라우저', markdown: '마크다운' };

  header.innerHTML = `
    <div class="panel-title">
      <span class="panel-type-icon">${typeIcons[panel.type]}</span>
      <span>${escapeHtml(panel.title || typeLabels[panel.type])}</span>
    </div>
    <div class="panel-actions">
      ${panel.type === 'terminal' ? '<button class="panel-btn" data-action="search" title="검색 (Ctrl+F)">⌕</button>' : ''}
      <button class="panel-btn" data-action="split-h" title="수평 분할 (Ctrl+D)">⇥</button>
      <button class="panel-btn" data-action="split-v" title="수직 분할 (Ctrl+Shift+D)">⤓</button>
      <button class="panel-btn" data-action="close" title="닫기 (Ctrl+W)">✕</button>
    </div>
  `;

  // 패널 버튼 이벤트
  header.querySelectorAll('.panel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'close') closePanel(panel.id);
      else if (action === 'split-h') {
        state.focusedPanelId = panel.id;
        splitPanel('horizontal');
      }
      else if (action === 'split-v') {
        state.focusedPanelId = panel.id;
        splitPanel('vertical');
      }
      else if (action === 'search') toggleTerminalSearch(panel.id);
    });
  });

  pane.appendChild(header);

  // 패널 콘텐츠
  if (panel.type === 'terminal') {
    // 마운트 포인트만 생성 — 실제 터미널 컨테이너는 renderWorkspaceContent에서 이동
    const mount = document.createElement('div');
    mount.className = 'term-mount';
    mount.dataset.panelId = panel.id;
    mount.style.width = '100%';
    mount.style.height = 'calc(100% - 28px)';
    pane.appendChild(mount);
  } else if (panel.type === 'browser') {
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

    const webview = document.createElement('webview');
    webview.className = 'browser-webview';
    webview.src = panel.url || 'https://www.google.com';
    webview.setAttribute('allowpopups', '');

    // 네비게이션 버튼
    toolbar.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.nav;
        if (nav === 'back') webview.goBack();
        else if (nav === 'forward') webview.goForward();
        else if (nav === 'reload') webview.reload();
      });
    });

    // URL 입력
    const urlInput = toolbar.querySelector('.url-input');
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        let url = urlInput.value.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        webview.src = url;
      }
    });

    // URL 변경 추적
    webview.addEventListener('did-navigate', (e) => {
      urlInput.value = e.url;
      panel.url = e.url;
      panel.title = webview.getTitle() || '브라우저';
    });

    browserPanel.appendChild(toolbar);
    browserPanel.appendChild(webview);
    pane.appendChild(browserPanel);
  }

  return pane;
}

// ── 분할 핸들 드래그 ──

function setupSplitHandleDrag(handle, node, container) {
  let isDragging = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = node.direction === 'horizontal' ? 'col-resize' : 'row-resize';

    const rect = container.getBoundingClientRect();

    const onMouseMove = (e) => {
      if (!isDragging) return;
      let ratio;
      if (node.direction === 'horizontal') {
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        ratio = (e.clientY - rect.top) / rect.height;
      }
      node.ratio = Math.max(0.15, Math.min(0.85, ratio));
      renderWorkspaceContent();
    };

    const onMouseUp = () => {
      isDragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ── 터미널 내 검색 ──

function toggleTerminalSearch(panelId) {
  const pane = document.querySelector(`.split-pane[data-panel-id="${panelId}"]`);
  if (!pane) return;

  let overlay = pane.querySelector('.search-overlay');
  if (overlay) {
    overlay.remove();
    return;
  }

  overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <input type="text" placeholder="검색..." autofocus>
    <span class="search-count"></span>
    <button class="panel-btn" data-dir="prev" title="이전">▲</button>
    <button class="panel-btn" data-dir="next" title="다음">▼</button>
    <button class="panel-btn" data-dir="close" title="닫기">✕</button>
  `;

  const input = overlay.querySelector('input');
  const instance = state.terminalInstances.get(panelId);

  input.addEventListener('input', () => {
    if (instance?.searchAddon) {
      instance.searchAddon.findNext(input.value);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) instance?.searchAddon.findPrevious(input.value);
      else instance?.searchAddon.findNext(input.value);
    }
    if (e.key === 'Escape') overlay.remove();
  });

  overlay.querySelectorAll('.panel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.dir;
      if (dir === 'close') overlay.remove();
      else if (dir === 'prev') instance?.searchAddon.findPrevious(input.value);
      else if (dir === 'next') instance?.searchAddon.findNext(input.value);
    });
  });

  pane.style.position = 'relative';
  pane.appendChild(overlay);
  input.focus();
}

// ── 커맨드 팔레트 ──

const commands = [
  { id: 'new-workspace', label: '새 워크스페이스', shortcut: 'Ctrl+N', action: () => createWorkspace() },
  { id: 'close-workspace', label: '워크스페이스 닫기', shortcut: 'Ctrl+Shift+W', action: () => { const ws = getActiveWorkspace(); if (ws) closeWorkspace(ws.id); } },
  { id: 'rename-workspace', label: '워크스페이스 이름 변경', shortcut: '', action: promptRenameWorkspace },
  { id: 'split-horizontal', label: '수평 분할', shortcut: 'Ctrl+D', action: () => splitPanel('horizontal') },
  { id: 'split-vertical', label: '수직 분할', shortcut: 'Ctrl+Shift+D', action: () => splitPanel('vertical') },
  { id: 'close-panel', label: '패널 닫기', shortcut: 'Ctrl+W', action: () => { if (state.focusedPanelId) closePanel(state.focusedPanelId); } },
  { id: 'open-browser', label: '브라우저 열기', shortcut: 'Ctrl+Shift+B', action: () => openBrowserPanel() },
  { id: 'toggle-sidebar', label: '사이드바 토글', shortcut: 'Ctrl+B', action: toggleSidebar },
  { id: 'terminal-search', label: '터미널 내 검색', shortcut: 'Ctrl+F', action: () => { if (state.focusedPanelId) toggleTerminalSearch(state.focusedPanelId); } },
  { id: 'notifications', label: '알림 보기', shortcut: 'Ctrl+Shift+U', action: toggleNotifications },
  { id: 'focus-next', label: '다음 패널로 이동', shortcut: 'Ctrl+]', action: () => focusAdjacentPanel(1) },
  { id: 'focus-prev', label: '이전 패널로 이동', shortcut: 'Ctrl+[', action: () => focusAdjacentPanel(-1) },
  { id: 'next-workspace', label: '다음 워크스페이스', shortcut: 'Ctrl+Tab', action: () => cycleWorkspace(1) },
  { id: 'prev-workspace', label: '이전 워크스페이스', shortcut: 'Ctrl+Shift+Tab', action: () => cycleWorkspace(-1) },
];

function showCommandPalette() {
  const palette = document.getElementById('command-palette');
  palette.classList.remove('hidden');
  const input = document.getElementById('palette-input');
  input.value = '';
  input.focus();
  renderPaletteResults('');
}

function hideCommandPalette() {
  document.getElementById('command-palette').classList.add('hidden');
}

function renderPaletteResults(query) {
  const results = document.getElementById('palette-results');
  results.innerHTML = '';

  const filtered = query
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  filtered.forEach((cmd, idx) => {
    const item = document.createElement('div');
    item.className = `palette-item${idx === 0 ? ' selected' : ''}`;
    item.innerHTML = `
      <span class="item-label">${escapeHtml(cmd.label)}</span>
      ${cmd.shortcut ? `<span class="item-shortcut">${cmd.shortcut}</span>` : ''}
    `;
    item.addEventListener('click', () => {
      hideCommandPalette();
      cmd.action();
    });
    results.appendChild(item);
  });
}

// 팔레트 키보드 네비게이션
document.getElementById('palette-input')?.addEventListener('input', (e) => {
  renderPaletteResults(e.target.value);
});

document.getElementById('palette-input')?.addEventListener('keydown', (e) => {
  const items = document.querySelectorAll('.palette-item');
  const selected = document.querySelector('.palette-item.selected');
  const selectedIdx = Array.from(items).indexOf(selected);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selected) selected.classList.remove('selected');
    const next = items[Math.min(selectedIdx + 1, items.length - 1)];
    next?.classList.add('selected');
    next?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selected) selected.classList.remove('selected');
    const prev = items[Math.max(selectedIdx - 1, 0)];
    prev?.classList.add('selected');
    prev?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    selected?.click();
  } else if (e.key === 'Escape') {
    hideCommandPalette();
  }
});

// 팔레트 배경 클릭으로 닫기
document.querySelector('.palette-backdrop')?.addEventListener('click', hideCommandPalette);

// ── 사이드바 토글 ──

function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebar-resize-handle');
  sidebar.classList.toggle('hidden', !state.sidebarVisible);
  handle.classList.toggle('hidden', !state.sidebarVisible);

  // 터미널 리사이즈
  setTimeout(() => fitAllTerminals(), 100);
}

// ── 알림 ──

function toggleNotifications() {
  const page = document.getElementById('notifications-page');
  const content = document.getElementById('workspace-content');
  page.classList.toggle('hidden');
  content.classList.toggle('hidden', !page.classList.contains('hidden'));
  if (!page.classList.contains('hidden')) {
    renderNotifications();
  }
}

function renderNotifications() {
  const list = document.getElementById('notification-list');
  if (!list) return;
  list.innerHTML = '';

  if (state.notifications.length === 0) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">알림이 없습니다</div>';
    return;
  }

  for (const notif of [...state.notifications].reverse()) {
    const item = document.createElement('div');
    item.className = `notification-item${notif.read ? ' read' : ''}`;
    item.innerHTML = `
      <div class="notif-title">${escapeHtml(notif.title)}</div>
      <div class="notif-body">${escapeHtml(notif.body)}</div>
      <div class="notif-time">${formatTime(notif.timestamp)}</div>
    `;
    item.addEventListener('click', () => {
      notif.read = true;
      // 해당 워크스페이스로 이동
      selectWorkspace(notif.workspaceId);
      toggleNotifications();
      renderSidebar();
    });
    list.appendChild(item);
  }
}

function addNotification(title, body, workspaceId, panelId) {
  const notif = {
    id: generateId(),
    workspaceId: workspaceId || state.activeWorkspaceId,
    panelId: panelId || state.focusedPanelId,
    title,
    body,
    timestamp: Date.now(),
    read: false,
  };
  state.notifications.push(notif);

  // 워크스페이스 미읽음 카운트 증가
  const ws = state.workspaces.find(w => w.id === notif.workspaceId);
  if (ws) ws.unreadNotifications++;

  renderSidebar();

  // 시스템 알림
  ipcRenderer.send('notification:send', notif);
}

document.getElementById('btn-mark-all-read')?.addEventListener('click', () => {
  state.notifications.forEach(n => n.read = true);
  state.workspaces.forEach(w => w.unreadNotifications = 0);
  renderNotifications();
  renderSidebar();
});

// ── 워크스페이스 컨텍스트 메뉴 ──

function showWorkspaceContextMenu(workspaceId, x, y) {
  // 기존 메뉴 제거
  document.querySelectorAll('.context-menu').forEach(m => m.remove());

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

function promptRenameWorkspace(wsId) {
  const id = wsId || state.activeWorkspaceId;
  const ws = state.workspaces.find(w => w.id === id);
  if (!ws) return;

  // 간단한 인라인 편집: 팔레트를 이름 입력 모드로 사용
  const palette = document.getElementById('command-palette');
  palette.classList.remove('hidden');
  const input = document.getElementById('palette-input');
  input.value = ws.name;
  input.placeholder = '새 이름 입력...';
  input.select();

  const results = document.getElementById('palette-results');
  results.innerHTML = '<div style="padding:12px 18px;color:var(--text-secondary);font-size:13px;">Enter로 확인, Esc로 취소</div>';

  const handler = (e) => {
    if (e.key === 'Enter') {
      renameWorkspace(id, input.value.trim() || ws.name);
      hideCommandPalette();
      input.removeEventListener('keydown', handler);
      input.placeholder = '명령 검색...';
    } else if (e.key === 'Escape') {
      hideCommandPalette();
      input.removeEventListener('keydown', handler);
      input.placeholder = '명령 검색...';
    }
  };
  input.addEventListener('keydown', handler);
}

// ── 네비게이션 ──

function cycleWorkspace(direction) {
  if (state.workspaces.length <= 1) return;
  const idx = state.workspaces.findIndex(w => w.id === state.activeWorkspaceId);
  const next = (idx + direction + state.workspaces.length) % state.workspaces.length;
  selectWorkspace(state.workspaces[next].id);
}

function focusAdjacentPanel(direction) {
  const ws = getActiveWorkspace();
  if (!ws || ws.panels.length <= 1) return;
  const idx = ws.panels.findIndex(p => p.id === state.focusedPanelId);
  const next = (idx + direction + ws.panels.length) % ws.panels.length;
  state.focusedPanelId = ws.panels[next].id;
  ws.activePanelId = ws.panels[next].id;

  // UI 포커스 업데이트
  document.querySelectorAll('.split-pane').forEach(p => {
    p.classList.toggle('focused', p.dataset.panelId === state.focusedPanelId);
    p.classList.toggle('unfocused', p.dataset.panelId !== state.focusedPanelId);
  });

  // 터미널 포커스
  const instance = state.terminalInstances.get(state.focusedPanelId);
  if (instance) instance.terminal.focus();
}

// ── 전역 키보드 단축키 ──

document.addEventListener('keydown', (e) => {
  // 커맨드 팔레트 내에서는 제한
  if (!document.getElementById('command-palette').classList.contains('hidden')) return;

  const ctrl = e.ctrlKey;
  const shift = e.shiftKey;
  const key = e.key;

  // Ctrl+Shift+P: 커맨드 팔레트
  if (ctrl && shift && key === 'P') { e.preventDefault(); showCommandPalette(); return; }
  // Ctrl+N: 새 워크스페이스
  if (ctrl && !shift && key === 'n') { e.preventDefault(); createWorkspace(); return; }
  // Ctrl+W: 패널 닫기
  if (ctrl && !shift && key === 'w') { e.preventDefault(); if (state.focusedPanelId) closePanel(state.focusedPanelId); return; }
  // Ctrl+Shift+W: 워크스페이스 닫기
  if (ctrl && shift && key === 'W') { e.preventDefault(); const ws = getActiveWorkspace(); if (ws) closeWorkspace(ws.id); return; }
  // Ctrl+D: 수평 분할
  if (ctrl && !shift && key === 'd') { e.preventDefault(); splitPanel('horizontal'); return; }
  // Ctrl+Shift+D: 수직 분할
  if (ctrl && shift && key === 'D') { e.preventDefault(); splitPanel('vertical'); return; }
  // Ctrl+B: 사이드바 토글
  if (ctrl && !shift && key === 'b') { e.preventDefault(); toggleSidebar(); return; }
  // Ctrl+Shift+B: 브라우저 열기
  if (ctrl && shift && key === 'B') { e.preventDefault(); openBrowserPanel(); return; }
  // Ctrl+F: 터미널 검색
  if (ctrl && !shift && key === 'f') { e.preventDefault(); if (state.focusedPanelId) toggleTerminalSearch(state.focusedPanelId); return; }
  // Ctrl+Tab: 다음 워크스페이스
  if (ctrl && !shift && key === 'Tab') { e.preventDefault(); cycleWorkspace(1); return; }
  // Ctrl+Shift+Tab: 이전 워크스페이스
  if (ctrl && shift && key === 'Tab') { e.preventDefault(); cycleWorkspace(-1); return; }
  // Ctrl+]: 다음 패널
  if (ctrl && key === ']') { e.preventDefault(); focusAdjacentPanel(1); return; }
  // Ctrl+[: 이전 패널
  if (ctrl && key === '[') { e.preventDefault(); focusAdjacentPanel(-1); return; }
  // Ctrl+Shift+U: 알림
  if (ctrl && shift && key === 'U') { e.preventDefault(); toggleNotifications(); return; }
});

// ── 사이드바 리사이즈 ──

const sidebarHandle = document.getElementById('sidebar-resize-handle');
if (sidebarHandle) {
  let isDragging = false;
  sidebarHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    sidebarHandle.classList.add('dragging');

    const onMove = (e) => {
      if (!isDragging) return;
      const sidebar = document.getElementById('sidebar');
      const width = Math.max(180, Math.min(400, e.clientX));
      sidebar.style.width = width + 'px';
      state.sidebarWidth = width;
      fitAllTerminals();
    };

    const onUp = () => {
      isDragging = false;
      sidebarHandle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── 타이틀바 버튼 ──

document.getElementById('btn-minimize')?.addEventListener('click', () => {
  const { BrowserWindow } = require('@electron/remote') || {};
  // Electron remote가 없으면 IPC 사용
  ipcRenderer.send('window:minimize');
});

document.getElementById('btn-maximize')?.addEventListener('click', () => {
  ipcRenderer.send('window:maximize');
});

document.getElementById('btn-close')?.addEventListener('click', () => {
  ipcRenderer.send('window:close');
});

// 타이틀바 IPC (메인에서 처리)
// main.ts에 추가 필요한 핸들러

document.getElementById('btn-new-workspace')?.addEventListener('click', () => createWorkspace());
document.getElementById('btn-notifications')?.addEventListener('click', toggleNotifications);
document.getElementById('btn-settings')?.addEventListener('click', () => {
  document.getElementById('settings-dialog').classList.toggle('hidden');
});
document.getElementById('btn-close-settings')?.addEventListener('click', () => {
  document.getElementById('settings-dialog').classList.add('hidden');
});

// 설정 다이얼로그 배경 클릭
document.querySelector('#settings-dialog .dialog-backdrop')?.addEventListener('click', () => {
  document.getElementById('settings-dialog').classList.add('hidden');
});

// ── Git 상태 폴링 ──

async function pollGitStatus() {
  for (const ws of state.workspaces) {
    if (!ws.cwd) continue;
    try {
      const status = await ipcRenderer.invoke('git:status', { cwd: ws.cwd });
      if (status) {
        ws.gitBranch = status.branch;
        ws.gitDirty = status.dirty;
        ws.prNumber = status.prNumber;
      }
    } catch {
      // 무시
    }
  }
  renderSidebar();
}

// 10초마다 Git 상태 갱신
setInterval(pollGitStatus, 10000);

// ── 포트 스캔 폴링 (PID → 자식 프로세스 트리 → 리스닝 포트) ──

async function pollPorts() {
  try {
    // 각 워크스페이스의 터미널 패널 PID를 수집
    const pidMap = new Map(); // pid → workspaceId[]
    const allPids = [];

    for (const ws of state.workspaces) {
      for (const panel of ws.panels) {
        if (panel.type === 'terminal') {
          const pid = await ipcRenderer.invoke('terminal:pid', { id: panel.id });
          if (pid) {
            allPids.push(pid);
            if (!pidMap.has(pid)) pidMap.set(pid, []);
            pidMap.get(pid).push(ws.id);
          }
        }
      }
    }

    if (allPids.length === 0) return;

    // 배치 조회: PID → 자식 프로세스 트리 → 리스닝 포트
    const portsByPid = await ipcRenderer.invoke('port:scan', { pids: allPids });
    if (!portsByPid) return;

    // 워크스페이스별 포트 집계
    const portsByWs = new Map();
    for (const [pidStr, ports] of Object.entries(portsByPid)) {
      const pid = parseInt(pidStr, 10);
      const wsIds = pidMap.get(pid) || [];
      for (const wsId of wsIds) {
        if (!portsByWs.has(wsId)) portsByWs.set(wsId, new Set());
        for (const port of ports) {
          portsByWs.get(wsId).add(port);
        }
      }
    }

    // 워크스페이스 상태 업데이트
    let changed = false;
    for (const ws of state.workspaces) {
      const newPorts = portsByWs.has(ws.id)
        ? Array.from(portsByWs.get(ws.id)).sort((a, b) => a - b)
        : [];
      const oldKey = ws.listeningPorts.join(',');
      const newKey = newPorts.join(',');
      if (oldKey !== newKey) {
        ws.listeningPorts = newPorts;
        changed = true;
      }
    }

    if (changed) renderSidebar();
  } catch {
    // 무시
  }
}

// 5초마다 포트 스캔
setInterval(pollPorts, 5000);
// 초기 로드 후 3초 뒤 첫 스캔
setTimeout(pollPorts, 3000);

// ── 세션 저장/복원 ──

ipcRenderer.on('session:request-snapshot', () => {
  const snapshot = {
    version: 1,
    windowBounds: null, // 메인 프로세스에서 처리
    workspaces: state.workspaces.map(ws => ({
      ...ws,
      // 스크롤백은 별도 처리 (용량 문제)
      panels: ws.panels.map(p => ({
        ...p,
        scrollback: undefined,
      })),
    })),
    activeWorkspaceId: state.activeWorkspaceId,
    sidebarWidth: state.sidebarWidth,
    sidebarVisible: state.sidebarVisible,
    savedAt: Date.now(),
  };
  ipcRenderer.send('session:save', snapshot);
});

// ── CLI IPC 명령 수신 ──

ipcRenderer.on('ipc:command', (_event, { method, params }) => {
  switch (method) {
    case 'new-workspace':
      createWorkspace(params?.name, params?.cwd);
      break;
    case 'select-workspace':
      if (params?.id) selectWorkspace(params.id);
      break;
    case 'rename-workspace':
      if (params?.id && params?.name) renameWorkspace(params.id, params.name);
      break;
    case 'new-split':
      splitPanel(params?.direction || 'horizontal');
      break;
    case 'open-browser':
      openBrowserPanel(params?.url);
      break;
    case 'notify':
      addNotification(
        params?.title || 'NexTerm',
        params?.body || '',
        params?.workspaceId,
        params?.panelId
      );
      break;
    case 'send':
      // 특정 패널에 텍스트 전송
      if (params?.panelId && params?.text) {
        const instance = state.terminalInstances.get(params.panelId);
        if (instance) {
          ipcRenderer.send('terminal:input', { id: params.panelId, data: params.text });
        }
      }
      break;
  }
});

// ── 유틸리티 ──

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 시스템에 설치된 폰트만 select에 남기기
 * Canvas 렌더링 비교 방식으로 폰트 존재 여부를 판별한다.
 */
function filterAvailableFonts(selectEl) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const testStr = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const fallback = 'serif';
  const size = '48px';

  ctx.font = `${size} ${fallback}`;
  const fallbackWidth = ctx.measureText(testStr).width;

  const options = Array.from(selectEl.options);
  for (const opt of options) {
    const fontName = opt.value;
    ctx.font = `${size} "${fontName}", ${fallback}`;
    const testWidth = ctx.measureText(testStr).width;
    // 폭이 다르면 해당 폰트가 설치되어 있다고 판단
    if (testWidth === fallbackWidth) {
      // 추가 검증: monospace 폴백과도 비교
      ctx.font = `${size} "${fontName}", monospace`;
      const monoWidth = ctx.measureText(testStr).width;
      ctx.font = `${size} monospace`;
      const defaultMonoWidth = ctx.measureText(testStr).width;
      if (monoWidth === defaultMonoWidth) {
        opt.disabled = true;
        opt.textContent = opt.textContent + ' (not installed)';
        opt.style.color = '#565f89';
      }
    }
  }
}

/** 모든 활성 터미널에 폰트 변경 반영 */
function applyFontToAllTerminals(fontFamily) {
  for (const [, inst] of state.terminalInstances) {
    try {
      inst.terminal.options.fontFamily = fontFamily;
      inst.fitAddon.fit();
    } catch {
      // 무시
    }
  }
}

/** 모든 활성 터미널에 폰트 크기 변경 반영 */
function applyFontSizeToAllTerminals(fontSize) {
  for (const [, inst] of state.terminalInstances) {
    try {
      inst.terminal.options.fontSize = fontSize;
      inst.fitAddon.fit();
    } catch {
      // 무시
    }
  }
}

function fitAllTerminals() {
  for (const [, inst] of state.terminalInstances) {
    try {
      inst.fitAddon.fit();
    } catch {
      // 무시
    }
  }
}

// 창 리사이즈 시 터미널 fit
window.addEventListener('resize', () => {
  requestAnimationFrame(fitAllTerminals);
});

// ── 앱 초기화 ──

async function init() {
  // 설정 로드
  try {
    state.settings = await ipcRenderer.invoke('settings:get');
  } catch {
    state.settings = {};
  }

  // 폰트 설정 — 시스템에 설치된 폰트만 표시 + 실시간 프리뷰
  const fontSelect = document.getElementById('setting-font');
  const fontPreview = document.getElementById('font-preview');
  if (fontSelect) {
    // 시스템에 설치된 폰트만 필터링
    filterAvailableFonts(fontSelect);

    // 현재 설정값 반영
    if (state.settings?.fontFamily) {
      const primary = state.settings.fontFamily.split(',')[0].trim();
      fontSelect.value = primary;
    }

    // 프리뷰 초기화
    if (fontPreview) {
      fontPreview.style.fontFamily = `"${fontSelect.value}", monospace`;
    }

    // 폰트 변경 시 프리뷰 + 전체 터미널 반영
    fontSelect.addEventListener('change', () => {
      const selected = fontSelect.value;
      if (fontPreview) {
        fontPreview.style.fontFamily = `"${selected}", monospace`;
      }
      // 설정 저장
      const fontFamily = `${selected}, monospace`;
      if (!state.settings) state.settings = {};
      state.settings.fontFamily = fontFamily;
      ipcRenderer.invoke('settings:set', { fontFamily });
      // 모든 터미널에 폰트 반영
      applyFontToAllTerminals(fontFamily);
    });
  }

  // 폰트 크기 변경
  const fontSizeInput = document.getElementById('setting-font-size');
  if (fontSizeInput) {
    fontSizeInput.value = state.settings?.fontSize || 14;
    fontSizeInput.addEventListener('change', () => {
      const size = parseInt(fontSizeInput.value, 10);
      if (size >= 8 && size <= 32) {
        if (!state.settings) state.settings = {};
        state.settings.fontSize = size;
        ipcRenderer.invoke('settings:set', { fontSize: size });
        applyFontSizeToAllTerminals(size);
        if (fontPreview) fontPreview.style.fontSize = size + 'px';
      }
    });
  }

  // 셸 설정 적용
  const shellSelect = document.getElementById('setting-shell');
  if (shellSelect) {
    state.defaultShell = shellSelect.value;
    shellSelect.addEventListener('change', () => {
      state.defaultShell = shellSelect.value;
    });
  }

  // 세션 복원 시도
  try {
    const session = await ipcRenderer.invoke('session:restore');
    if (session && session.workspaces && session.workspaces.length > 0) {
      // 세션 복원 (터미널은 새로 생성, 레이아웃만 복원)
      for (const wsState of session.workspaces) {
        const ws = {
          ...wsState,
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
    }
  } catch {
    // 세션 복원 실패 시 무시
  }

  // 워크스페이스가 없으면 기본 생성
  if (state.workspaces.length === 0) {
    createWorkspace();
  } else {
    renderSidebar();
    renderWorkspaceContent();
  }

  // Git 상태 초기 로드
  setTimeout(pollGitStatus, 1000);
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', init);
