/**
 * 전역 키보드 단축키
 * 기본 바인딩 + 사용자 커스텀 오버라이드 (keybindings.json)
 *
 * keybindings.json 형식: { "actionId": "Ctrl+Shift+X", ... }
 * 빈 문자열로 설정하면 해당 단축키 비활성화
 */
import { state, electronAPI } from './state';
import {
  createWorkspace,
  closeWorkspace,
  splitPanel,
  closePanel,
  openBrowserPanel,
  restoreClosedBrowserTab,
  togglePanelZoom,
  getActiveWorkspace,
  cycleWorkspace,
  focusAdjacentPanel,
} from './workspace';
import { toggleTerminalSearch } from './search';
import { showCommandPalette } from './command-palette';

import { fitAllTerminals } from './terminal';

let toggleSidebarHandler: (() => void) | null = null;

export function setToggleSidebarHandler(fn: () => void): void {
  toggleSidebarHandler = fn;
}

/** 프레젠테이션 모드 토글 (사이드바 + 타이틀바 숨김) */
function togglePresentation(): void {
  state.presentationMode = !state.presentationMode;
  const titlebar = document.getElementById('titlebar');
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebar-resize-handle');

  if (state.presentationMode) {
    titlebar?.classList.add('hidden');
    sidebar?.classList.add('hidden');
    handle?.classList.add('hidden');
    document.body.classList.add('presentation-mode');
  } else {
    titlebar?.classList.remove('hidden');
    if (state.sidebarVisible) {
      sidebar?.classList.remove('hidden');
      handle?.classList.remove('hidden');
    }
    document.body.classList.remove('presentation-mode');
  }
  setTimeout(() => fitAllTerminals(), 100);
}

// ── 액션 → 핸들러 매핑 ──

const ACTION_HANDLERS: Record<string, () => void> = {
  'command-palette': () => showCommandPalette(),
  'new-workspace': () => createWorkspace(),
  'close-panel': () => { if (state.focusedPanelId) closePanel(state.focusedPanelId); },
  'close-workspace': () => { const ws = getActiveWorkspace(); if (ws) closeWorkspace(ws.id); },
  'split-horizontal': () => splitPanel('horizontal'),
  'split-vertical': () => splitPanel('vertical'),
  'toggle-sidebar': () => toggleSidebarHandler?.(),
  'open-browser': () => openBrowserPanel(),
  'terminal-search': () => { if (state.focusedPanelId) toggleTerminalSearch(state.focusedPanelId); },
  'next-workspace': () => cycleWorkspace(1),
  'prev-workspace': () => cycleWorkspace(-1),
  'focus-next': () => focusAdjacentPanel(1),
  'focus-prev': () => focusAdjacentPanel(-1),
  'restore-tab': () => restoreClosedBrowserTab(),
  'zoom-panel': () => togglePanelZoom(),
  'presentation-mode': () => togglePresentation(),
};

// ── 기본 키 바인딩: actionId → 키 조합 ──

const DEFAULT_BINDINGS: Record<string, string> = {
  'command-palette': 'Ctrl+Shift+P',
  'new-workspace': 'Ctrl+N',
  'close-panel': 'Ctrl+W',
  'close-workspace': 'Ctrl+Shift+W',
  'split-horizontal': 'Ctrl+D',
  'split-vertical': 'Ctrl+Shift+D',
  'toggle-sidebar': 'Ctrl+B',
  'open-browser': 'Ctrl+Shift+B',
  'terminal-search': 'Ctrl+F',
  'next-workspace': 'Ctrl+Tab',
  'prev-workspace': 'Ctrl+Shift+Tab',
  'focus-next': 'Ctrl+]',
  'focus-prev': 'Ctrl+[',
  'restore-tab': 'Ctrl+Shift+T',
  'zoom-panel': 'Ctrl+Shift+Z',
  'presentation-mode': 'Ctrl+Shift+F',
};

// 런타임 바인딩: 키 조합 → actionId (역방향 매핑)
let keyToAction = new Map<string, string>();

/** 키 조합 문자열 정규화 (비교용) */
function normalizeKeyCombo(combo: string): string {
  return combo.toLowerCase().split('+').sort().join('+');
}

/** KeyboardEvent → 키 조합 문자열 */
function eventToKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  let key = e.key;
  // Tab, [, ] 등은 그대로 사용
  if (key === 'Tab') key = 'tab';
  else if (key.length === 1) key = key.toLowerCase();
  else key = key.toLowerCase();

  parts.push(key);
  return parts.sort().join('+');
}

/** 바인딩 맵 빌드 (기본 + 커스텀 오버라이드 병합) */
function buildKeyMap(customBindings: Record<string, string>): void {
  keyToAction = new Map();

  // 기본 바인딩 적용
  const merged = { ...DEFAULT_BINDINGS, ...customBindings };

  for (const [actionId, combo] of Object.entries(merged)) {
    if (!combo || !ACTION_HANDLERS[actionId]) continue; // 빈 문자열 = 비활성화
    const normalized = normalizeKeyCombo(combo);
    keyToAction.set(normalized, actionId);
  }
}

/** 초기화: 커스텀 바인딩 로드 + 이벤트 리스너 등록 */
export async function initKeyboardShortcuts(): Promise<void> {
  // 커스텀 바인딩 로드
  let customBindings: Record<string, string> = {};
  try {
    customBindings = await electronAPI.invoke('keybindings:get') as Record<string, string> || {};
  } catch {
    // 로드 실패 시 기본 바인딩만 사용
  }

  buildKeyMap(customBindings);

  document.addEventListener('keydown', (e) => {
    // 커맨드 팔레트가 열려 있으면 단축키 차단
    if (!document.getElementById('command-palette')?.classList.contains('hidden')) return;

    const combo = eventToKeyCombo(e);
    const actionId = keyToAction.get(combo);

    if (actionId && ACTION_HANDLERS[actionId]) {
      e.preventDefault();
      ACTION_HANDLERS[actionId]();
    }
  });
}

/** 키 이벤트가 글로벌 단축키인지 확인 (xterm customKeyEventHandler용) */
export function shouldInterceptKey(e: KeyboardEvent): boolean {
  const combo = eventToKeyCombo(e);
  return keyToAction.has(combo);
}

/** 현재 바인딩 목록 반환 (설정 UI용) */
export function getCurrentBindings(): Array<{ actionId: string; keys: string; label: string }> {
  const actionLabels: Record<string, string> = {
    'command-palette': '커맨드 팔레트',
    'new-workspace': '새 워크스페이스',
    'close-panel': '패널 닫기',
    'close-workspace': '워크스페이스 닫기',
    'split-horizontal': '수평 분할',
    'split-vertical': '수직 분할',
    'toggle-sidebar': '사이드바 토글',
    'open-browser': '브라우저 열기',
    'terminal-search': '터미널 검색',
    'next-workspace': '다음 워크스페이스',
    'prev-workspace': '이전 워크스페이스',
    'focus-next': '다음 패널',
    'focus-prev': '이전 패널',
    'restore-tab': '닫은 탭 복원',
  };

  const result: Array<{ actionId: string; keys: string; label: string }> = [];
  for (const [combo, actionId] of keyToAction) {
    result.push({
      actionId,
      keys: combo,
      label: actionLabels[actionId] || actionId,
    });
  }
  return result;
}
