/**
 * 터미널 명령어 빈도 추적
 *
 * "사용자가 실제로 입력한 명령"만 누적 카운트하고, Top N을 추출하여
 * "자주쓰는 명령어" 팝업에서 사용한다.
 *
 * 기록 대상:
 *  - 직접 타이핑 후 Enter로 확정된 한 줄
 *  - ↑/↓ 방향키로 셸 히스토리에서 불러와 실행한 명령
 *    (키 입력만으로는 내용을 알 수 없으므로 Enter 시점에 화면 버퍼에서
 *     커서까지의 라인을 읽고, 탐색 시작 시점에 잰 프롬프트 길이를 잘라낸다)
 *
 * 기록 제외:
 *  - paste 계열 전부 — 클립보드 붙여넣기, 제안(pending input) 커밋,
 *    자주쓰는 명령어 팝업 삽입, CLI/에이전트 주입, 드래그앤드롭 경로
 *  - bracketed paste 시퀀스(ESC[200~ ... ESC[201~) 내용
 *  - 대체 버퍼(vim 등 TUI 앱)에서의 입력
 *
 * 저장: localStorage (Electron 렌더러에서 영속)
 *   - 키: 'nexterm.commandHistory.v1'
 *   - 값: { [command: string]: { count: number; lastUsed: number } }
 */

const STORAGE_KEY = 'nexterm.commandHistory.v1';
const MAX_ENTRIES = 500; // 너무 커지지 않도록 상한
const MAX_CMD_LEN = 500;

interface Entry {
  count: number;
  lastUsed: number;
}

type Store = Record<string, Entry>;

let store: Store = loadStore();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Store;
  } catch {
    // 손상 시 빈 스토어로 시작
  }
  return {};
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      // 상한 초과 시 lastUsed 오래된 것부터 제거 (LRU)
      const keys = Object.keys(store);
      if (keys.length > MAX_ENTRIES) {
        const sorted = keys
          .map((k) => ({ k, t: store[k].lastUsed }))
          .sort((a, b) => a.t - b.t);
        const toRemove = sorted.slice(0, keys.length - MAX_ENTRIES);
        for (const r of toRemove) delete store[r.k];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // localStorage 가득 차거나 사용 불가 시 무시
    }
  }, 800);
}

/** 명령어 1건 기록 */
export function recordCommand(rawCmd: string): void {
  const cmd = rawCmd.trim();
  if (!cmd) return;
  if (cmd.length > MAX_CMD_LEN) return;
  // 제어문자만 들어있는 경우 무시
  if (!/[\w가-힣]/.test(cmd)) return;

  const existing = store[cmd];
  if (existing) {
    existing.count += 1;
    existing.lastUsed = Date.now();
  } else {
    store[cmd] = { count: 1, lastUsed: Date.now() };
  }
  scheduleSave();
}

/** 빈도순 Top N — 동률은 최근 사용 우선 */
export function getTopCommands(n: number, filter?: string): Array<{ cmd: string; count: number; lastUsed: number }> {
  const f = filter?.trim().toLowerCase() || '';
  let entries = Object.entries(store).map(([cmd, e]) => ({ cmd, count: e.count, lastUsed: e.lastUsed }));
  if (f) entries = entries.filter((e) => e.cmd.toLowerCase().includes(f));
  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastUsed - a.lastUsed;
  });
  return entries.slice(0, n);
}

/** 특정 명령어 삭제 */
export function deleteCommand(cmd: string): void {
  if (cmd in store) {
    delete store[cmd];
    scheduleSave();
  }
}

/** 전체 초기화 */
export function clearAllCommands(): void {
  store = {};
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}

// ── 입력 스트림에서 한 줄 명령어 추출 ──

/**
 * 화면 버퍼 접근용 최소 인터페이스.
 * xterm Terminal이 구조적으로 만족하며, 테스트에서는 가짜 구현을 주입한다.
 */
export interface TerminalLike {
  buffer: {
    active: {
      type: string; // 'normal' | 'alternate'
      baseY: number;
      cursorY: number;
      cursorX: number;
      getLine(y: number): {
        isWrapped: boolean;
        translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
      } | undefined;
    };
  };
}

/** 패널별 입력 라인 추적 상태 */
interface LineTrack {
  buf: string;          // 직접 타이핑으로 복원한 한 줄
  tainted: boolean;     // paste 등 비-타이핑 입력이 섞임 → 이 라인은 기록 제외
  screenRead: boolean;  // ↑/↓/Tab으로 셸이 라인을 바꿈 → Enter 시 화면에서 읽음
  promptLen: number;    // screenRead 시작 시점에 잰 프롬프트 길이
  suppressNext: boolean; // 다음 onData 청크는 프로그램적 paste — 통째로 무시
  inPaste: boolean;     // bracketed paste 진행 중 (청크 경계를 넘을 수 있음)
}

const tracks = new Map<string, LineTrack>();

function getTrack(panelId: string): LineTrack {
  let t = tracks.get(panelId);
  if (!t) {
    t = { buf: '', tainted: false, screenRead: false, promptLen: 0, suppressNext: false, inPaste: false };
    tracks.set(panelId, t);
  }
  return t;
}

/** 라인 확정/취소 시 상태 초기화 (paste 진행 플래그는 별도 수명) */
function resetLine(t: LineTrack): void {
  t.buf = '';
  t.tainted = false;
  t.screenRead = false;
  t.promptLen = 0;
}

/**
 * 프로그램적 paste 직전에 호출한다 (pasteTextToPanel 등).
 * xterm의 paste()는 동기적으로 onData 이벤트 1건을 발생시키므로,
 * 바로 다음 청크를 통째로 무시하고 현재 라인을 오염 처리한다.
 */
export function markPastedInput(panelId: string): void {
  const t = getTrack(panelId);
  t.suppressNext = true;
  t.tainted = true;
}

/**
 * 화면 버퍼에서 커서가 위치한 논리 라인(wrapped 포함)을 커서 위치까지 읽는다.
 * 커서 이후를 자르는 이유: PSReadLine 인라인 예측(ghost text)이나
 * 우측 프롬프트(oh-my-posh 등)가 커서 뒤에 그려지므로 이를 배제하기 위함.
 */
function readLineUpToCursor(term: TerminalLike): string {
  const active = term.buffer.active;
  const cursorAbs = active.baseY + active.cursorY;

  // 논리 라인의 시작(wrapped가 아닌 행)까지 거슬러 올라간다
  let start = cursorAbs;
  while (start > 0 && active.getLine(start)?.isWrapped) start--;

  let text = '';
  for (let r = start; r < cursorAbs; r++) {
    const line = active.getLine(r);
    if (!line) return text;
    text += line.translateToString(false);
  }
  const cursorLine = active.getLine(cursorAbs);
  if (cursorLine) text += cursorLine.translateToString(false, 0, active.cursorX);
  return text;
}

/**
 * ↑/↓/Tab 감지 시 호출 — 셸이 입력 라인을 바꾸므로 타이핑 버퍼만으로는
 * 명령을 알 수 없다. 현재 시점의 (라인 길이 - 타이핑 길이)로 프롬프트
 * 길이를 재두고, Enter 시 화면에서 읽어 프롬프트를 잘라낸다.
 */
function activateScreenRead(t: LineTrack, term?: TerminalLike): void {
  if (t.screenRead || !term) return;
  if (term.buffer.active.type === 'alternate') return;
  const line = readLineUpToCursor(term);
  t.promptLen = Math.max(0, line.length - t.buf.length);
  t.screenRead = true;
}

/** Enter로 라인 확정 — 기록 여부를 판단하고 상태를 초기화한다 */
function finalizeLine(t: LineTrack, term?: TerminalLike): void {
  const { tainted, screenRead, promptLen, buf } = t;
  resetLine(t);

  if (tainted) return;
  // vim 등 TUI 앱 입력은 셸 명령이 아님
  if (term && term.buffer.active.type === 'alternate') return;

  if (screenRead) {
    if (!term) return;
    recordCommand(readLineUpToCursor(term).slice(promptLen));
  } else {
    recordCommand(buf);
  }
}

export function consumeInputForHistory(panelId: string, data: string, term?: TerminalLike): void {
  const t = getTrack(panelId);

  // 직전에 예약된 프로그램적 paste — 이 청크 전체가 paste 데이터
  if (t.suppressNext) {
    t.suppressNext = false;
    // 개행으로 끝나는 즉시 실행형 paste는 셸이 라인을 소비한 것 →
    // 오염 상태를 여기서 끝내야 사용자가 다음에 직접 친 명령이 정상 기록된다
    const body = data.endsWith('\x1b[201~') ? data.slice(0, -6) : data;
    if (body.endsWith('\r') || body.endsWith('\n')) resetLine(t);
    return;
  }

  let i = 0;
  while (i < data.length) {
    const ch = data[i];
    const code = ch.charCodeAt(0);

    // bracketed paste 내용 — 종료 마커(ESC[201~)만 찾고 나머지는 버린다
    if (t.inPaste) {
      if (code === 0x1b && data.startsWith('[201~', i + 1)) {
        t.inPaste = false;
        i += 6;
        continue;
      }
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      finalizeLine(t, term);
      i++;
      continue;
    }

    // Backspace
    if (ch === '\x7f' || code === 8) {
      t.buf = t.buf.slice(0, -1);
      i++;
      continue;
    }

    // Ctrl+C, Ctrl+U → 입력 취소
    if (ch === '\x03' || ch === '\x15') {
      resetLine(t);
      i++;
      continue;
    }

    // Tab → 셸 자동완성이 라인을 바꾸므로 화면 읽기 모드로 전환
    if (ch === '\t') {
      activateScreenRead(t, term);
      i++;
      continue;
    }

    // ESC 시퀀스 → CSI(\x1b[...), SS3(\x1bO.), OSC(\x1b]...)
    if (code === 0x1b) {
      i++;
      if (i >= data.length) break;
      if (data[i] === '[') {
        i++;
        const paramStart = i;
        while (i < data.length && !/[a-zA-Z~]/.test(data[i])) i++;
        if (i < data.length) {
          const final = data[i];
          const params = data.slice(paramStart, i);
          if (final === 'A' || final === 'B') {
            // ↑/↓ — 셸 히스토리 탐색
            activateScreenRead(t, term);
          } else if (final === '~' && params === '200') {
            // bracketed paste 시작 — 내용을 버리고 라인 오염 처리
            t.inPaste = true;
            t.tainted = true;
          }
          i++;
        }
        continue;
      }
      // SS3 (애플리케이션 커서 키 모드): ESC O A/B = ↑/↓
      if (data[i] === 'O') {
        i++;
        if (i < data.length) {
          if (data[i] === 'A' || data[i] === 'B') activateScreenRead(t, term);
          i++;
        }
        continue;
      }
      // OSC \x1b] ... BEL/ST 시퀀스
      if (data[i] === ']') {
        i++;
        while (i < data.length && data[i] !== '\x07' && data[i] !== '\x1b') i++;
        if (i < data.length && data[i] === '\x1b' && i + 1 < data.length) i += 2;
        else if (i < data.length) i++;
        continue;
      }
      // 알 수 없는 ESC — 한 글자 건너뜀
      i++;
      continue;
    }

    // 기타 제어 문자 — 무시
    if (code < 0x20) {
      i++;
      continue;
    }

    t.buf += ch;
    i++;
  }

  // 너무 길어지면 버림 (오작동 방지)
  if (t.buf.length > MAX_CMD_LEN * 2) resetLine(t);
}

/** 패널 종료 시 호출 — 버퍼 정리 */
export function dropPanelBuffer(panelId: string): void {
  tracks.delete(panelId);
}
