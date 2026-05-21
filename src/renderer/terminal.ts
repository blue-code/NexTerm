/**
 * xterm.js 터미널 인스턴스 관리
 * 생성·파괴·리사이즈·폰트 변경 + IPC 이벤트 리스너 등록
 */
import {
  state, electronAPI, type TerminalInst,
  Terminal, FitAddon, SearchAddon, WebglAddon,
} from './state';
import { TERMINAL_THEMES } from './themes';
import { shouldInterceptKey } from './keyboard';
import { createLogger } from './logger';
import { consumeInputForHistory, dropPanelBuffer } from './command-history';
import { handleKeyAgainstPending, dropPendingInput } from './pending-input';
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
  scrollback?: string,
  resumeAgent?: string | null,
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

    // 보류된 "다음 명령" 제안이 있다면 키 입력에 따라 처리한다.
    // consumed: 키를 PTY로 전달하지 않음(이미 처리됨)
    // discarded: 제안만 폐기하고 키는 그대로 셸로 전달
    // committed: 제안을 입력창에 paste 후 키도 셸로 전달 (화살표 등으로 편집 시작)
    // pass: 제안 없음 또는 무관한 키
    const pendingDecision = handleKeyAgainstPending(panelId, e);
    if (pendingDecision === 'consumed') {
      e.preventDefault();
      return false;
    }
    // 그 외(committed/discarded/pass)는 기존 단축키·xterm 처리로 흘려보냄

    // Ctrl+C: 선택 영역이 있으면 복사, 없으면 SIGINT
    if (ctrl && !shift && key.toLowerCase() === 'c') {
      if (terminal.hasSelection()) {
        copySelectionFromPanel(panelId);
        return false;
      }
      return true; // SIGINT 전달
    }

    // Ctrl+V: 붙여넣기 (텍스트 우선, 없으면 이미지 → 임시 파일 경로 삽입)
    // preventDefault로 브라우저 기본 paste 이벤트를 차단하여 이중 붙여넣기 방지
    if (ctrl && key.toLowerCase() === 'v') {
      e.preventDefault();
      pasteFromClipboardToPanel(panelId);
      return false;
    }

    // 커스텀 키바인딩에 등록된 단축키는 xterm에서 차단
    if (shouldInterceptKey(e)) return false;

    return true;
  });

  // 파일 드래그 앤 드롭 → 파일 경로 삽입
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    container.classList.add('drag-over');
  });

  container.addEventListener('dragleave', (e) => {
    e.preventDefault();
    container.classList.remove('drag-over');
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    container.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // 드롭된 파일 경로를 터미널에 삽입 (공백 포함 대비 따옴표)
    const paths = Array.from(files)
      .map((f: File & { path?: string }) => f.path ? `"${f.path}"` : '')
      .filter(Boolean)
      .join(' ');
    if (paths) {
      terminal.paste(paths);
      terminal.focus();
    }
  });

  // 세션 복원 시 저장된 스크롤백 기록
  // xterm.js는 \n만으로는 커서가 다음 줄 시작으로 돌아가지 않으므로 \r\n으로 변환
  if (scrollback) {
    terminal.write(scrollback.replace(/\r?\n/g, '\r\n') + '\r\n');
  }

  // 메인 프로세스에 터미널 생성 요청
  electronAPI.invoke('terminal:create', {
    id: panelId,
    cwd: cwd || electronAPI.env.USERPROFILE,
    shell: shell || state.defaultShell,
    shellCommand: shellCommand || '',
    resumeAgent: resumeAgent || null,
  });

  terminal.onData((data: string) => {
    electronAPI.send('terminal:input', { id: panelId, data });
    // 명령어 빈도 추적: 입력 스트림을 한 줄 단위로 누적
    consumeInputForHistory(panelId, data);
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
    dropPanelBuffer(panelId);
    dropPendingInput(panelId);
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

/** 개별 터미널 fit (스크롤 위치 보존) */
export function fitTerminal(inst: TerminalInst): void {
  try {
    const term = inst.terminal;
    const rect = inst.container.getBoundingClientRect();
    if (!inst.container.isConnected || rect.width <= 0 || rect.height <= 0) {
      return;
    }

    // 현재 스크롤 위치 저장: 최하단에 있으면 fit 후에도 최하단 유지
    const savedViewportY = term.buffer.active.viewportY;
    const isAtBottom = term.buffer.active.viewportY >= term.buffer.active.baseY;

    inst.fitAddon.fit();

    // 최하단이 아니었으면 스크롤 위치 복원 (밀어올림 방지)
    if (!isAtBottom && term.buffer.active.baseY > 0) {
      term.scrollToLine(Math.min(savedViewportY, term.buffer.active.baseY));
    }
  } catch {
    // 이미 dispose된 터미널 무시
  }
}

/** DOM 마운트 직후 레이아웃 확정까지 기다린 뒤 fit */
export function queueTerminalFit(inst: TerminalInst): void {
  requestAnimationFrame(() => {
    fitTerminal(inst);
    requestAnimationFrame(() => fitTerminal(inst));
  });
}

// ── fit 디바운스: 여러 곳에서 동시 호출 시 1회만 실행 ──

let fitDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 모든 터미널 fit (디바운스 적용, 50ms 내 중복 호출 병합) */
export function fitAllTerminals(): void {
  if (fitDebounceTimer) return;
  fitDebounceTimer = setTimeout(() => {
    fitDebounceTimer = null;
    for (const [, inst] of state.terminalInstances) {
      fitTerminal(inst);
    }
  }, 50);
}

/** 즉시 fit (레이아웃 변경 직후 등 지연 불가 시) */
export function fitAllTerminalsImmediate(): void {
  if (fitDebounceTimer) {
    clearTimeout(fitDebounceTimer);
    fitDebounceTimer = null;
  }
  for (const [, inst] of state.terminalInstances) {
    fitTerminal(inst);
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
      // 활성 패널의 CWD 변경 시 워크스페이스 CWD도 갱신 (Git 폴링 등에서 사용)
      if (ws.activePanelId === panelId) {
        ws.cwd = cwdPath;
      }
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

// ── 스크롤백 직렬화/복원 ──

const MAX_SCROLLBACK_LINES = 4000;
const MAX_SCROLLBACK_CHARS = 400000;

/** xterm 버퍼에서 스크롤백 텍스트를 추출한다 (ANSI 포함, 최대 4000라인) */
export function serializeTerminalBuffer(panelId: string): string | undefined {
  const inst = state.terminalInstances.get(panelId);
  if (!inst) return undefined;

  const buffer = inst.terminal.buffer.active;
  const totalLines = buffer.length;
  if (totalLines === 0) return undefined;

  // 최대 라인 수 제한
  const startLine = Math.max(0, totalLines - MAX_SCROLLBACK_LINES);
  const lines: string[] = [];
  let charCount = 0;

  for (let i = startLine; i < totalLines; i++) {
    const line = buffer.getLine(i);
    if (!line) continue;
    const text = line.translateToString(true); // trimRight
    charCount += text.length;
    if (charCount > MAX_SCROLLBACK_CHARS) break;
    lines.push(text);
  }

  // 빈 내용은 저장하지 않음
  const result = lines.join('\n');
  return result.trim().length > 0 ? result : undefined;
}

/** 저장된 스크롤백을 터미널에 기록한다 (세션 복원 시) */
export function writeScrollbackToTerminal(panelId: string, scrollback: string): void {
  const inst = state.terminalInstances.get(panelId);
  if (!inst || !scrollback) return;

  // xterm.js는 \n만으로 커서 복귀 안 함 → \r\n으로 변환하여 기록
  inst.terminal.write(scrollback.replace(/\r?\n/g, '\r\n') + '\r\n');
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

// ── 붙여넣기/선택 전송 헬퍼 ──

/**
 * 임의 텍스트를 터미널에 paste한다.
 * xterm의 paste()는 bracketed paste 마커를 자동 처리하므로 그대로 사용한다.
 * 대용량 텍스트는 메인 프로세스의 청크 쓰기에서 처리되므로 여기서는 분할하지 않는다.
 */
export function pasteTextToPanel(panelId: string, text: string): void {
  if (!text) return;
  const inst = state.terminalInstances.get(panelId);
  if (!inst) return;
  // CRLF/LF 정규화 — 셸은 \r을 라인 종결로 처리하므로 통일
  const normalized = text.replace(/\r\n/g, '\n');
  inst.terminal.paste(normalized);
}

/** 클립보드 텍스트(없으면 이미지 임시파일 경로)를 패널에 붙여넣는다. */
export function pasteFromClipboardToPanel(panelId: string): void {
  const inst = state.terminalInstances.get(panelId);
  if (!inst) return;
  const text = electronAPI.clipboard.readText();
  if (text) {
    pasteTextToPanel(panelId, text);
    return;
  }
  const imgPath = electronAPI.clipboard.saveImageToTemp();
  if (imgPath) {
    pasteTextToPanel(panelId, `"${imgPath}"`);
  }
}

/**
 * 현재 선택 영역을 같은 패널의 입력으로 보낸다.
 * 자동 Enter는 부여하지 않는다 — 줄바꿈은 사용자의 선택 안에 포함된 경우에만.
 */
export function sendSelectionAsInput(panelId: string): boolean {
  const inst = state.terminalInstances.get(panelId);
  if (!inst) return false;
  if (!inst.terminal.hasSelection()) return false;
  const sel = inst.terminal.getSelection();
  if (!sel) return false;
  pasteTextToPanel(panelId, sel);
  inst.terminal.clearSelection();
  inst.terminal.focus();
  return true;
}

/** 클립보드에 현재 선택을 복사 (선택이 없으면 false) */
export function copySelectionFromPanel(panelId: string): boolean {
  const inst = state.terminalInstances.get(panelId);
  if (!inst) return false;
  if (!inst.terminal.hasSelection()) return false;
  electronAPI.clipboard.writeText(inst.terminal.getSelection());
  inst.terminal.clearSelection();
  return true;
}
