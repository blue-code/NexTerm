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
import { t } from '../shared/i18n';

interface Command {
  id: string;
  label: string;
  shortcut: string;
  action: () => void;
}

export function buildCommands(): Command[] {
  return [
    { id: 'new-workspace', label: t('cmd.new_workspace'), shortcut: 'Ctrl+N', action: () => createWorkspace() },
    { id: 'close-workspace', label: t('cmd.close_workspace'), shortcut: 'Ctrl+Shift+W', action: () => { const ws = getActiveWorkspace(); if (ws) closeWorkspace(ws.id); } },
    { id: 'rename-workspace', label: t('cmd.rename_workspace'), shortcut: '', action: () => promptRenameWorkspace() },
    { id: 'split-horizontal', label: t('cmd.split_h'), shortcut: 'Ctrl+D', action: () => splitPanel('horizontal') },
    { id: 'split-vertical', label: t('cmd.split_v'), shortcut: 'Ctrl+Shift+D', action: () => splitPanel('vertical') },
    { id: 'close-panel', label: t('cmd.close_panel'), shortcut: 'Ctrl+W', action: () => { if (state.focusedPanelId) closePanel(state.focusedPanelId); } },
    { id: 'open-browser', label: t('cmd.open_browser'), shortcut: 'Ctrl+Shift+B', action: () => openBrowserPanel() },
    { id: 'toggle-sidebar', label: t('cmd.toggle_sidebar'), shortcut: 'Ctrl+B', action: () => toggleSidebarFn?.() },
    { id: 'terminal-search', label: t('cmd.terminal_search'), shortcut: 'Ctrl+F', action: () => { if (state.focusedPanelId) toggleTerminalSearch(state.focusedPanelId); } },
    { id: 'focus-next', label: t('cmd.focus_next'), shortcut: 'Ctrl+]', action: () => focusAdjacentPanel(1) },
    { id: 'focus-prev', label: t('cmd.focus_prev'), shortcut: 'Ctrl+[', action: () => focusAdjacentPanel(-1) },
    { id: 'next-workspace', label: t('cmd.next_workspace'), shortcut: 'Ctrl+Tab', action: () => cycleWorkspace(1) },
    { id: 'prev-workspace', label: t('cmd.prev_workspace'), shortcut: 'Ctrl+Shift+Tab', action: () => cycleWorkspace(-1) },
    { id: 'restore-tab', label: t('cmd.restore_tab'), shortcut: 'Ctrl+Shift+T', action: () => restoreClosedBrowserTab() },
    { id: 'zoom-panel', label: t('cmd.zoom_panel'), shortcut: 'Ctrl+Shift+Z', action: () => togglePanelZoom() },
    { id: 'open-markdown', label: t('cmd.open_markdown'), shortcut: '', action: async () => {
      const filePath = await import('./state').then(m => m.electronAPI.invoke('dialog:open-file', {
        filters: [{ name: t('panel.markdown'), extensions: ['md', 'markdown', 'txt'] }],
      })) as string | null;
      if (filePath) openMarkdownPanel(filePath);
    }},
  ];
}

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

  const commands = buildCommands();
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
