/**
 * xterm.js 터미널 인스턴스 관리
 * 생성·파괴·리사이즈·폰트 변경 + IPC 이벤트 리스너 등록
 */
import {
  state, electronAPI, type TerminalInst,
  Terminal, FitAddon, SearchAddon, WebglAddon,
} from './state';
import { TERMINAL_THEMES } from './themes';
import { createLogger } from './logger';
import type { PanelState } from '../../shared/types';

const log = createLogger('terminal');

// 터미널 DOM 컨테이너 풀 — 레이아웃 재렌더 시에도 터미널 DOM을 파괴하지 않고 보존
export const terminalPool = document.createElement('div');
terminalPool.id = 'terminal-pool';
terminalPool.style.display = 'none';
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(terminalPool));

// IPC 리스너 해제 함수 보관 (리소스 정리용)
const ipcCleanups: Array<() => void> = [];

/** 터미널 인스턴스 생성 (이미 존재하면 기존 반환) */
export function createTerminalInstance(
  panelId: string,
  cwd?: string,
  shell?: string,
  shellCommand?: string,
): TerminalInst {
  if (state.terminalInstances.has(panelId)) {
    return state.terminalInstances.get(panelId)!;
  }

  const container = document.createElement('div');
  container.className = 'terminal-container';
  container.dataset.termPanelId = panelId;
  terminalPool.appendChild(container);

  const currentThemeName = state.settings?.theme || 'dark';
  const terminal = new Terminal({
    fontFamily: state.settings?.fontFamily || 'Cascadia Code, Consolas, monospace',
    fontSize: state.settings?.fontSize || 14,
    scrollback: state.settings?.scrollbackLimit || 10000,
    cursorBlink: true,
    cursorStyle: 'bar',
    theme: TERMINAL_THEMES[currentThemeName] || TERMINAL_THEMES.dark,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(searchAddon);
  terminal.open(container);

  try {
    const webglAddon = new WebglAddon();
    terminal.loadAddon(webglAddon);
    webglAddon.onContextLoss(() => webglAddon.dispose());
  } catch {
    log.debug('WebGL 미지원, Canvas 폴백');
  }

  // 앱 단축키를 xterm보다 먼저 처리
  terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if (e.type !== 'keydown') return true;
    const ctrl = e.ctrlKey;
    const shift = e.shiftKey;
    const key = e.key;

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

    // Ctrl+C: 선택 영역이 있으면 클립보드 복사
    if (ctrl && !shift && key.toLowerCase() === 'c') {
      if (terminal.hasSelection()) {
        electronAPI.clipboard.writeText(terminal.getSelection());
        terminal.clearSelection();
        return false;
      }
      return true;
    }

    // Ctrl+V: 클립보드 → PTY 직접 전송
    if (ctrl && !shift && key.toLowerCase() === 'v') {
      e.preventDefault();
      const text = electronAPI.clipboard.readText();
      if (text) {
        electronAPI.send('terminal:input', { id: panelId, data: text });
      }
      return false;
    }

    return true;
  });

  // 메인 프로세스에 터미널 생성 요청
  electronAPI.invoke('terminal:create', {
    id: panelId,
    cwd: cwd || electronAPI.env.USERPROFILE,
    shell: shell || state.defaultShell,
    shellCommand: shellCommand || '',
  });

  terminal.onData((data: string) => {
    electronAPI.send('terminal:input', { id: panelId, data });
  });

  terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
    electronAPI.send('terminal:resize', { id: panelId, cols, rows });
  });

  terminal.onTitleChange((title: string) => {
    updatePanelCwd(panelId, title);
  });

  const inst: TerminalInst = { terminal, fitAddon, searchAddon, container };
  state.terminalInstances.set(panelId, inst);
  return inst;
}

/** 터미널 인스턴스 제거 */
export function destroyTerminal(panelId: string): void {
  const instance = state.terminalInstances.get(panelId);
  if (instance) {
    instance.terminal.dispose();
    instance.container.remove();
    state.terminalInstances.delete(panelId);
    electronAPI.send('terminal:close', { id: panelId });
  }
}

/** 모든 활성 터미널에 폰트 변경 반영 */
export function applyFontToAllTerminals(fontFamily: string): void {
  for (const [, inst] of state.terminalInstances) {
    try {
      inst.terminal.options.fontFamily = fontFamily;
      inst.fitAddon.fit();
    } catch (err) {
      log.debug('폰트 적용 실패', err);
    }
  }
}

/** 모든 활성 터미널에 폰트 크기 변경 반영 */
export function applyFontSizeToAllTerminals(fontSize: number): void {
  for (const [, inst] of state.terminalInstances) {
    try {
      inst.terminal.options.fontSize = fontSize;
      inst.fitAddon.fit();
    } catch (err) {
      log.debug('폰트 크기 적용 실패', err);
    }
  }
}

/** 모든 터미널 fit (리사이즈 반영) */
export function fitAllTerminals(): void {
  for (const [, inst] of state.terminalInstances) {
    try {
      inst.fitAddon.fit();
    } catch {
      // 이미 dispose된 터미널 무시
    }
  }
}

/** 셸 타이틀 → 패널 헤더 폴더명 갱신 */
function updatePanelCwd(panelId: string, title: string): void {
  if (!title) return;

  let cwdPath = title.replace(/^(PS\s+|)/, '').replace(/[>]\s*$/, '').trim();
  if (!/^[A-Za-z]:[\\/]/.test(cwdPath) && !/^\\\\/.test(cwdPath)) return;
  if (/\.(exe|cmd|bat|com)$/i.test(cwdPath)) return;

  const folderName = cwdPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  if (!folderName) return;

  for (const ws of state.workspaces) {
    const panel = ws.panels.find((p: PanelState) => p.id === panelId);
    if (panel) {
      panel.cwd = cwdPath;
      break;
    }
  }

  const pane = document.querySelector(`.split-pane[data-panel-id="${panelId}"]`);
  if (!pane) return;
  const titleText = pane.querySelector('.panel-title-text');
  if (titleText) {
    titleText.textContent = `터미널: ${folderName}`;
  }
}

// ── IPC 이벤트 리스너 ──

export function initTerminalIpcListeners(): void {
  // 메인 프로세스에서 터미널 출력 수신
  const removeData = electronAPI.on('terminal:data', (payload: unknown) => {
    const { id, data } = payload as { id: string; data: string };
    const instance = state.terminalInstances.get(id);
    if (instance) {
      instance.terminal.write(data);
    }
  });
  ipcCleanups.push(removeData);

  // 터미널 종료 이벤트
  const removeClose = electronAPI.on('terminal:close', (payload: unknown) => {
    const { id, exitCode } = payload as { id: string; exitCode: number };
    const instance = state.terminalInstances.get(id);
    if (instance) {
      instance.terminal.writeln(`\r\n\x1b[90m[프로세스 종료, 코드: ${exitCode}]\x1b[0m`);
    }
  });
  ipcCleanups.push(removeClose);
}

/** 모든 터미널 IPC 리스너 정리 */
export function cleanupTerminalIpcListeners(): void {
  for (const cleanup of ipcCleanups) {
    cleanup();
  }
  ipcCleanups.length = 0;
}
