/**
 * 터미널 명령어 빈도 추적
 *
 * 사용자가 터미널에 입력한 명령어(Enter로 확정된 한 줄)를 누적 카운트하고,
 * Top N을 추출하여 "자주쓰는 명령어" 팝업에서 사용한다.
 *
 * 저장: localStorage (Electron 렌더러에서 영속)
 *   - 키: 'nexterm.commandHistory.v1'
 *   - 값: { [command: string]: { count: number; lastUsed: number } }
 *
 * 입력 추적은 xterm의 onData에서 일어난다. data는 키 입력 시퀀스를 그대로
 * 받기 때문에 ESC/제어문자/백스페이스를 직접 해석해 한 줄을 복원한다.
 * 완벽하진 않지만 통계 목적으로는 충분하다.
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
 * 패널별로 입력 버퍼를 누적한다.
 * - 일반 문자 → 버퍼에 추가
 * - Backspace(\x7f, \b) → 끝 한 글자 제거
 * - CR/LF → 버퍼를 명령어로 확정해 기록 후 비움
 * - Ctrl+C(\x03), Ctrl+U(\x15) → 현재 버퍼 폐기
 * - ESC[...] CSI 시퀀스 → 화살표/탭 등 → 단순화를 위해 무시
 */
const buffers = new Map<string, string>();

export function consumeInputForHistory(panelId: string, data: string): void {
  let buf = buffers.get(panelId) || '';
  let i = 0;
  while (i < data.length) {
    const ch = data[i];
    const code = ch.charCodeAt(0);

    if (ch === '\r' || ch === '\n') {
      recordCommand(buf);
      buf = '';
      i++;
      continue;
    }

    // Backspace
    if (ch === '\x7f' || code === 8) {
      buf = buf.slice(0, -1);
      i++;
      continue;
    }

    // Ctrl+C, Ctrl+U → 입력 취소
    if (ch === '\x03' || ch === '\x15') {
      buf = '';
      i++;
      continue;
    }

    // ESC 시퀀스 → CSI(\x1b[...) 또는 단일 ESC — 종료 바이트까지 건너뜀
    if (code === 0x1b) {
      i++;
      if (i >= data.length) break;
      // bracketed paste 마커는 화면 표시에 영향 없음 → 건너뜀
      if (data[i] === '[') {
        i++;
        while (i < data.length && !/[a-zA-Z~]/.test(data[i])) i++;
        if (i < data.length) i++;
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

    // 기타 제어 문자 (탭, Ctrl+ 등) — 무시
    if (code < 0x20) {
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  // 너무 길어지면 버림 (오작동 방지)
  if (buf.length > MAX_CMD_LEN * 2) buf = '';

  buffers.set(panelId, buf);
}

/** 패널 종료 시 호출 — 버퍼 정리 */
export function dropPanelBuffer(panelId: string): void {
  buffers.delete(panelId);
}
