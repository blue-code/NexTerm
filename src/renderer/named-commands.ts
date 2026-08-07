/**
 * 이름 붙인 빠른 명령어 (pinned) — 저장/수정/삭제
 *
 * command-history.ts의 자동 빈도 추적과 별개로, 사용자가 직접 이름을 붙여
 * 저장해두는 명령어 목록이다. "빠른 명령" 팝업(quick-commands.ts)에서 사용한다.
 *
 * 저장: localStorage
 *   - 키: 'nexterm.namedCommands.v1'
 *   - 값: NamedCommand[]
 */

const STORAGE_KEY = 'nexterm.namedCommands.v1';
const MAX_ENTRIES = 100;

export interface NamedCommand {
  id: string;
  name: string;
  command: string;
  createdAt: number;
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

/** 이름/명령 필터로 목록 조회 (최근 생성 우선) */
export function getNamedCommands(filter?: string): NamedCommand[] {
  const f = filter?.trim().toLowerCase() || '';
  let entries = [...store];
  if (f) {
    entries = entries.filter((e) =>
      e.name.toLowerCase().includes(f) || e.command.toLowerCase().includes(f));
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

/** 새 명령어 저장 */
export function addNamedCommand(name: string, command: string): NamedCommand | null {
  const trimmedName = name.trim();
  const trimmedCmd = command.trim();
  if (!trimmedName || !trimmedCmd) return null;
  if (store.length >= MAX_ENTRIES) return null;
  const entry: NamedCommand = { id: generateId(), name: trimmedName, command: trimmedCmd, createdAt: Date.now() };
  store.push(entry);
  save();
  return entry;
}

/** 이름/명령 수정 */
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
