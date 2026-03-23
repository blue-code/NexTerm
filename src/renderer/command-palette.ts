/**
 * 커맨드 팔레트 — Ctrl+Shift+P로 호출
 */
import { escapeHtml } from './utils';
import {
  createWorkspace,
  closeWorkspace,
  splitPanel,
  closePanel,
  openBrowserPanel,
  openMarkdownPanel,
  restoreClosedBrowserTab,
  togglePanelZoom,
  getActiveWorkspace,
  cycleWorkspace,
  focusAdjacentPanel,
} from './workspace';
import { state } from './state';
import { toggleTerminalSearch } from './search';
import { promptRenameWorkspace } from './render';

interface Command {
  id: string;
  label: string;
  shortcut: string;
  action: () => void;
}

export const commands: Command[] = [
  { id: 'new-workspace', label: '새 워크스페이스', shortcut: 'Ctrl+N', action: () => createWorkspace() },
  { id: 'close-workspace', label: '워크스페이스 닫기', shortcut: 'Ctrl+Shift+W', action: () => { const ws = getActiveWorkspace(); if (ws) closeWorkspace(ws.id); } },
  { id: 'rename-workspace', label: '워크스페이스 이름 변경', shortcut: '', action: () => promptRenameWorkspace() },
  { id: 'split-horizontal', label: '수평 분할', shortcut: 'Ctrl+D', action: () => splitPanel('horizontal') },
  { id: 'split-vertical', label: '수직 분할', shortcut: 'Ctrl+Shift+D', action: () => splitPanel('vertical') },
  { id: 'close-panel', label: '패널 닫기', shortcut: 'Ctrl+W', action: () => { if (state.focusedPanelId) closePanel(state.focusedPanelId); } },
  { id: 'open-browser', label: '브라우저 열기', shortcut: 'Ctrl+Shift+B', action: () => openBrowserPanel() },
  { id: 'toggle-sidebar', label: '사이드바 토글', shortcut: 'Ctrl+B', action: () => toggleSidebarFn?.() },
  { id: 'terminal-search', label: '터미널 내 검색', shortcut: 'Ctrl+F', action: () => { if (state.focusedPanelId) toggleTerminalSearch(state.focusedPanelId); } },
  { id: 'focus-next', label: '다음 패널로 이동', shortcut: 'Ctrl+]', action: () => focusAdjacentPanel(1) },
  { id: 'focus-prev', label: '이전 패널로 이동', shortcut: 'Ctrl+[', action: () => focusAdjacentPanel(-1) },
  { id: 'next-workspace', label: '다음 워크스페이스', shortcut: 'Ctrl+Tab', action: () => cycleWorkspace(1) },
  { id: 'prev-workspace', label: '이전 워크스페이스', shortcut: 'Ctrl+Shift+Tab', action: () => cycleWorkspace(-1) },
  { id: 'restore-tab', label: '닫은 브라우저 탭 복원', shortcut: 'Ctrl+Shift+T', action: () => restoreClosedBrowserTab() },
  { id: 'zoom-panel', label: '패널 줌/최대화 토글', shortcut: 'Ctrl+Shift+Z', action: () => togglePanelZoom() },
  { id: 'open-markdown', label: '마크다운 파일 열기', shortcut: '', action: async () => {
    const filePath = await import('./state').then(m => m.electronAPI.invoke('dialog:open-file', {
      filters: [{ name: '마크다운', extensions: ['md', 'markdown', 'txt'] }],
    })) as string | null;
    if (filePath) openMarkdownPanel(filePath);
  }},
];

// 사이드바 토글 함수 참조 (순환 의존성 방지)
let toggleSidebarFn: (() => void) | null = null;
export function setToggleSidebar(fn: () => void): void {
  toggleSidebarFn = fn;
}

export function showCommandPalette(): void {
  const palette = document.getElementById('command-palette')!;
  palette.classList.remove('hidden');
  const input = document.getElementById('palette-input') as HTMLInputElement;
  input.value = '';
  input.focus();
  renderPaletteResults('');
}

export function hideCommandPalette(): void {
  document.getElementById('command-palette')?.classList.add('hidden');
}

function renderPaletteResults(query: string): void {
  const results = document.getElementById('palette-results')!;
  results.innerHTML = '';

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
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

/** 팔레트 키보드 이벤트 등록 (DOM 로드 후 호출) */
export function initCommandPaletteEvents(): void {
  const paletteInput = document.getElementById('palette-input');

  paletteInput?.addEventListener('input', (e) => {
    renderPaletteResults((e.target as HTMLInputElement).value);
  });

  paletteInput?.addEventListener('keydown', (e) => {
    const items = document.querySelectorAll('.palette-item');
    const selected = document.querySelector('.palette-item.selected');
    const selectedIdx = Array.from(items).indexOf(selected!);

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
      (selected as HTMLElement)?.click();
    } else if (e.key === 'Escape') {
      hideCommandPalette();
    }
  });

  document.querySelector('.palette-backdrop')?.addEventListener('click', hideCommandPalette);
}
