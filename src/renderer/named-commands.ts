/**
 * 이름 붙인 빠른 명령어 (pinned) — 저장/수정/삭제
 *
 * command-history.ts의 자동 빈도 추적과 별개로, 사용자가 직접 이름을 붙여
 * 저장해두는 명령어 목록이다. 등록한 디렉토리(cwd)에만 해당하는 명령이라,
 * 그 디렉토리로 열린 패널에서만 조회/표시된다 ("빠른 명령" 팝업과 패널 헤더 아이콘).
 *
 * 저장: localStorage
 *   - 키: 'nexterm.namedCommands.v1'
 *   - 값: NamedCommand[]
 */

const STORAGE_KEY = 'nexterm.namedCommands.v1';
const MAX_ENTRIES = 200;

export interface NamedCommand {
  id: string;
  name: string;
  command: string;
  cwd: string; // 이 명령이 유효한 디렉토리 — 등록 시점의 패널 cwd로 고정, 수정 불가
  createdAt: number;
  lastUsedAt: number; // 등록 시 createdAt과 동일하게 시작, 실행할 때마다 갱신 — 헤더의 대표(▶) 명령 선정 기준
}

let store: NamedCommand[] = loadStore();

function loadStore(): NamedCommand[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as NamedCommand[];
  } catch {
    // 손상 시 빈 스토어로 시작
  }
  return [];
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage 가득 차거나 사용 불가 시 무시
  }
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 특정 디렉토리에 등록된 명령어만 조회 (이름/명령 필터 가능, 최근 사용 우선) */
export function getNamedCommands(cwd: string, filter?: string): NamedCommand[] {
  const f = filter?.trim().toLowerCase() || '';
  let entries = store.filter((e) => e.cwd === cwd);
  if (f) {
    entries = entries.filter((e) =>
      e.name.toLowerCase().includes(f) || e.command.toLowerCase().includes(f));
  }
  return entries.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/** 새 명령어 저장 — 지정한 디렉토리에만 유효 */
export function addNamedCommand(name: string, command: string, cwd: string): NamedCommand | null {
  const trimmedName = name.trim();
  const trimmedCmd = command.trim();
  if (!trimmedName || !trimmedCmd || !cwd) return null;
  if (store.length >= MAX_ENTRIES) return null;
  const now = Date.now();
  const entry: NamedCommand = { id: generateId(), name: trimmedName, command: trimmedCmd, cwd, createdAt: now, lastUsedAt: now };
  store.push(entry);
  save();
  return entry;
}

/** 실행 시 호출 — "마지막 사용" 시각을 갱신해 헤더의 대표(▶) 명령으로 올라오게 한다 */
export function touchNamedCommand(id: string): void {
  const entry = store.find((e) => e.id === id);
  if (!entry) return;
  entry.lastUsedAt = Date.now();
  save();
}

/** 이름/명령 수정 (cwd는 등록 당시 값으로 고정, 변경 불가) */
export function updateNamedCommand(id: string, name: string, command: string): void {
  const trimmedName = name.trim();
  const trimmedCmd = command.trim();
  if (!trimmedName || !trimmedCmd) return;
  const entry = store.find((e) => e.id === id);
  if (!entry) return;
  entry.name = trimmedName;
  entry.command = trimmedCmd;
  save();
}

/** 삭제 */
export function deleteNamedCommand(id: string): void {
  const idx = store.findIndex((e) => e.id === id);
  if (idx === -1) return;
  store.splice(idx, 1);
  save();
}
