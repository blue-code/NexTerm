/**
 * 패널 우클릭 컨텍스트 메뉴
 * 터미널/브라우저/마크다운 패널에서 우클릭 시 표시되는 액션 메뉴.
 * 메뉴 항목은 패널 타입과 선택 상태에 따라 동적으로 구성된다.
 */
import { state, electronAPI } from './state';
import {
  pasteFromClipboardToPanel,
  pasteTextToPanel,
} from './terminal';
import { closePanel, splitPanel, togglePanelZoom } from './workspace';
import { toggleTerminalSearch } from './search';
import type { PanelState } from '../shared/types';

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

/**
 * 외부 클릭/Esc로 메뉴를 닫는다.
 * 한 번에 하나의 메뉴만 표시되도록 기존 메뉴는 제거한다.
 */
function showMenu(items: MenuItem[], x: number, y: number): void {
  closeExistingMenus();

  const menu = document.createElement('div');
  menu.className = 'panel-context-menu';
  // 임시 좌표 — 측정 후 화면 경계 안으로 보정
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'panel-context-menu-separator';
      menu.appendChild(sep);
      continue;
    }
    const row = document.createElement('div');
    row.className = 'panel-context-menu-item';
    if (item.disabled) row.classList.add('disabled');

    const label = document.createElement('span');
    label.className = 'panel-context-menu-label';
    label.textContent = item.label;
    row.appendChild(label);

    if (item.shortcut) {
      const sc = document.createElement('span');
      sc.className = 'panel-context-menu-shortcut';
      sc.textContent = item.shortcut;
      row.appendChild(sc);
    }

    if (!item.disabled && item.action) {
      row.addEventListener('mousedown', (e) => {
        // 클릭 닫힘 핸들러보다 먼저 동작하도록 mousedown에서 처리
        e.preventDefault();
        e.stopPropagation();
        closeExistingMenus();
        item.action!();
      });
    }
    menu.appendChild(row);
  }

  document.body.appendChild(menu);

  // 화면 경계 보정 — 메뉴가 뷰포트를 벗어나면 좌측/상단으로 뒤집기
  const rect = menu.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let nx = x;
  let ny = y;
  if (rect.right > vw) nx = Math.max(0, vw - rect.width - 4);
  if (rect.bottom > vh) ny = Math.max(0, vh - rect.height - 4);
  menu.style.left = `${nx}px`;
  menu.style.top = `${ny}px`;

  // 다음 틱부터 외부 클릭 닫힘 활성화 (현재 클릭이 자동 닫힘 트리거되지 않도록)
  setTimeout(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) closeExistingMenus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeExistingMenus();
    };
    document.addEventListener('mousedown', onClickOutside, true);
    document.addEventListener('keydown', onKey, true);
    // 메뉴 제거 시 리스너 자동 정리
    (menu as HTMLElement & { _cleanup?: () => void })._cleanup = () => {
      document.removeEventListener('mousedown', onClickOutside, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, 0);
}

function closeExistingMenus(): void {
  document.querySelectorAll('.panel-context-menu').forEach((m) => {
    const cleanup = (m as HTMLElement & { _cleanup?: () => void })._cleanup;
    if (cleanup) cleanup();
    m.remove();
  });
}

/** 패널 영역 우클릭 핸들러 등록 */
export function attachPanelContextMenu(pane: HTMLElement, panel: PanelState): void {
  pane.addEventListener('contextmenu', (e) => {
    // textarea/input 위에서는 브라우저 기본 메뉴를 사용하도록 양보.
    // 단, xterm의 숨은 helper textarea는 예외 — 터미널 우클릭 시 이벤트 타깃이
    // 이 textarea가 되는데, 여기서 양보하면 네이티브 메뉴가 뜨고 그 "복사"는
    // xterm 내부 선택(DOM 선택이 아님)을 읽지 못해 아무것도 복사되지 않는다.
    const target = e.target as HTMLElement;
    if (target && (
      target.tagName === 'INPUT' ||
      (target.tagName === 'TEXTAREA' && !target.classList.contains('xterm-helper-textarea'))
    )) return;

    e.preventDefault();
    e.stopPropagation();

    // 우클릭한 패널에 포커스 이동
    state.focusedPanelId = panel.id;

    const items = buildMenuForPanel(panel);
    showMenu(items, e.clientX, e.clientY);
  });
}

/** 패널 타입별 메뉴 항목 구성 */
function buildMenuForPanel(panel: PanelState): MenuItem[] {
  if (panel.type === 'terminal') return buildTerminalMenu(panel);
  if (panel.type === 'browser') return buildBrowserMenu(panel);
  return buildMarkdownMenu(panel);
}

function buildTerminalMenu(panel: PanelState): MenuItem[] {
  const inst = state.terminalInstances.get(panel.id);
  // 메뉴가 떠 있는 사이 클릭/포커스 이동으로 선택이 풀릴 수 있으므로
  // 메뉴 생성 시점의 선택 텍스트를 캡처해 두고 액션에서 이것을 사용한다.
  const selectedText = inst?.terminal.getSelection() || '';
  const zoomed = state.zoomedPanelId === panel.id;

  return [
    {
      label: '복사',
      shortcut: 'Ctrl+Shift+C',
      disabled: !selectedText,
      action: () => {
        electronAPI.clipboard.writeText(selectedText);
        inst?.terminal.clearSelection();
      },
    },
    {
      label: '붙여넣기',
      shortcut: 'Ctrl+V',
      action: () => {
        pasteFromClipboardToPanel(panel.id);
        inst?.terminal.focus();
      },
    },
    { label: '', separator: true },
    {
      label: '선택 영역 입력으로 전송',
      disabled: !selectedText,
      action: () => {
        pasteTextToPanel(panel.id, selectedText);
        inst?.terminal.clearSelection();
        inst?.terminal.focus();
      },
    },
    {
      label: '모두 선택',
      shortcut: 'Ctrl+A',
      action: () => {
        inst?.terminal.selectAll();
        inst?.terminal.focus();
      },
    },
    {
      label: '화면 지우기',
      shortcut: 'Ctrl+L',
      action: () => {
        inst?.terminal.clear();
        inst?.terminal.focus();
      },
    },
    { label: '', separator: true },
    {
      label: '검색',
      shortcut: 'Ctrl+F',
      action: () => toggleTerminalSearch(panel.id),
    },
    {
      label: zoomed ? '패널 축소' : '패널 확장',
      shortcut: 'Ctrl+Shift+Z',
      action: () => togglePanelZoom(),
    },
    { label: '', separator: true },
    {
      label: '수평 분할',
      shortcut: 'Ctrl+D',
      action: () => {
        state.focusedPanelId = panel.id;
        splitPanel('horizontal');
      },
    },
    {
      label: '수직 분할',
      shortcut: 'Ctrl+Shift+D',
      action: () => {
        state.focusedPanelId = panel.id;
        splitPanel('vertical');
      },
    },
    { label: '', separator: true },
    {
      label: '닫기',
      shortcut: 'Ctrl+W',
      action: () => closePanel(panel.id),
    },
  ];
}

function buildBrowserMenu(panel: PanelState): MenuItem[] {
  const zoomed = state.zoomedPanelId === panel.id;

  return [
    {
      label: '뒤로',
      action: () => {
        const wv = findWebviewIn(panel.id);
        wv?.goBack();
      },
    },
    {
      label: '앞으로',
      action: () => {
        const wv = findWebviewIn(panel.id);
        wv?.goForward();
      },
    },
    {
      label: '새로고침',
      action: () => {
        const wv = findWebviewIn(panel.id);
        wv?.reload();
      },
    },
    { label: '', separator: true },
    {
      label: zoomed ? '패널 축소' : '패널 확장',
      shortcut: 'Ctrl+Shift+Z',
      action: () => togglePanelZoom(),
    },
    {
      label: '개발자 도구',
      action: () => {
        const wv = findWebviewIn(panel.id);
        wv?.openDevTools();
      },
    },
    { label: '', separator: true },
    {
      label: '수평 분할',
      shortcut: 'Ctrl+D',
      action: () => {
        state.focusedPanelId = panel.id;
        splitPanel('horizontal');
      },
    },
    {
      label: '수직 분할',
      shortcut: 'Ctrl+Shift+D',
      action: () => {
        state.focusedPanelId = panel.id;
        splitPanel('vertical');
      },
    },
    { label: '', separator: true },
    {
      label: '닫기',
      shortcut: 'Ctrl+W',
      action: () => closePanel(panel.id),
    },
  ];
}

function buildMarkdownMenu(panel: PanelState): MenuItem[] {
  const zoomed = state.zoomedPanelId === panel.id;
  return [
    {
      label: zoomed ? '패널 축소' : '패널 확장',
      shortcut: 'Ctrl+Shift+Z',
      action: () => togglePanelZoom(),
    },
    { label: '', separator: true },
    {
      label: '수평 분할',
      shortcut: 'Ctrl+D',
      action: () => {
        state.focusedPanelId = panel.id;
        splitPanel('horizontal');
      },
    },
    {
      label: '수직 분할',
      shortcut: 'Ctrl+Shift+D',
      action: () => {
        state.focusedPanelId = panel.id;
        splitPanel('vertical');
      },
    },
    { label: '', separator: true },
    {
      label: '닫기',
      shortcut: 'Ctrl+W',
      action: () => closePanel(panel.id),
    },
  ];
}

interface BrowserWebview extends HTMLElement {
  goBack(): void;
  goForward(): void;
  reload(): void;
  openDevTools(): void;
}

function findWebviewIn(panelId: string): BrowserWebview | null {
  const pane = document.querySelector(`.split-pane[data-panel-id="${panelId}"]`);
  return (pane?.querySelector('webview') as BrowserWebview) || null;
}
