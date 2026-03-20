/**
 * 전역 키보드 단축키
 */
import { state } from './state';
import {
  createWorkspace,
  closeWorkspace,
  splitPanel,
  closePanel,
  openBrowserPanel,
  getActiveWorkspace,
  cycleWorkspace,
  focusAdjacentPanel,
} from './workspace';
import { toggleTerminalSearch } from './search';
import { toggleNotifications } from './notifications';
import { showCommandPalette } from './command-palette';

let toggleSidebarHandler: (() => void) | null = null;

export function setToggleSidebarHandler(fn: () => void): void {
  toggleSidebarHandler = fn;
}

export function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // 커맨드 팔레트 열려 있으면 단축키 차단
    if (!document.getElementById('command-palette')?.classList.contains('hidden')) return;

    const ctrl = e.ctrlKey;
    const shift = e.shiftKey;
    const key = e.key;

    if (ctrl && shift && key === 'P') { e.preventDefault(); showCommandPalette(); return; }
    if (ctrl && !shift && key === 'n') { e.preventDefault(); createWorkspace(); return; }
    if (ctrl && !shift && key === 'w') { e.preventDefault(); if (state.focusedPanelId) closePanel(state.focusedPanelId); return; }
    if (ctrl && shift && key === 'W') { e.preventDefault(); const ws = getActiveWorkspace(); if (ws) closeWorkspace(ws.id); return; }
    if (ctrl && !shift && key === 'd') { e.preventDefault(); splitPanel('horizontal'); return; }
    if (ctrl && shift && key === 'D') { e.preventDefault(); splitPanel('vertical'); return; }
    if (ctrl && !shift && key === 'b') { e.preventDefault(); toggleSidebarHandler?.(); return; }
    if (ctrl && shift && key === 'B') { e.preventDefault(); openBrowserPanel(); return; }
    if (ctrl && !shift && key === 'f') { e.preventDefault(); if (state.focusedPanelId) toggleTerminalSearch(state.focusedPanelId); return; }
    if (ctrl && !shift && key === 'Tab') { e.preventDefault(); cycleWorkspace(1); return; }
    if (ctrl && shift && key === 'Tab') { e.preventDefault(); cycleWorkspace(-1); return; }
    if (ctrl && key === ']') { e.preventDefault(); focusAdjacentPanel(1); return; }
    if (ctrl && key === '[') { e.preventDefault(); focusAdjacentPanel(-1); return; }
    if (ctrl && shift && key === 'U') { e.preventDefault(); toggleNotifications(); return; }
  });
}
