/**
 * 빠른 명령 팝업 (패널 헤더의 » 버튼에서 연다) + 헤더 아이콘용 인라인 편집 팝오버
 *
 * 사이드바의 기존 "자주쓰는 명령어"(frequent-commands.ts, 자동 빈도 추적)와는 별개로,
 * 사용자가 이름을 붙여 저장한 명령어(named-commands.ts)를 우선 보여주고,
 * 자동 빈도 목록은 "▷ 명령" 섹션 안에 접어둔다.
 *
 * 등록한 명령은 등록 당시 패널의 디렉토리(cwd)에만 유효하다 — 같은 디렉토리로 연
 * 패널의 헤더에 실행 아이콘으로 바로 뜨고(render.ts), 다른 디렉토리에서는 보이지 않는다.
 */
import { state, triggerContentRender } from './state';
import {
  getNamedCommands,
  addNamedCommand,
  updateNamedCommand,
  deleteNamedCommand,
  touchNamedCommand,
  type NamedCommand,
} from './named-commands';
import {
  getTopCommands,
  deleteCommand,
  recordCommand,
} from './command-history';
import { pasteTextToPanel } from './terminal';
import { escapeHtml } from './utils';

const POPUP_ID = 'quick-commands-popup';
const MAX_HISTORY_ITEMS = 50;

let popup: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

// 팝업이 열려 있는 동안의 임시 UI 상태
let currentCwd = '';
let addingNew = false;
let editingId: string | null = null;
let historyExpanded = false;

/** 패널 헤더 » 버튼 클릭 시 토글 호출. cwd는 그 패널의 작업 디렉토리(workspace.ts resolvePanelCwd) */
export function toggleQuickCommands(anchor: HTMLElement | undefined, cwd: string): void {
  if (popup && !popup.classList.contains('hidden')) {
    closePopup();
    return;
  }
  openPopup(anchor, cwd);
}

function openPopup(anchor: HTMLElement | undefined, cwd: string): void {
  if (!popup) popup = buildPopup();
  popup.classList.remove('hidden');

  currentCwd = cwd;
  addingNew = false;
  editingId = null;
  historyExpanded = false;

  const cwdEl = popup.querySelector('.qcmd-header-cwd');
  if (cwdEl) cwdEl.textContent = folderNameOf(cwd);

  const rect = anchor?.getBoundingClientRect();
  if (rect) {
    // 팝업 실제 너비(460px, #quick-commands-popup)만큼 뷰포트 안에 들어오도록 클램프
    const left = Math.min(window.innerWidth - 468, rect.left);
    const top = Math.min(window.innerHeight - 420, rect.bottom + 6);
    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top = `${Math.max(8, top)}px`;
  } else {
    popup.style.left = '60px';
    popup.style.bottom = '12px';
    popup.style.top = 'auto';
  }

  if (searchInput) searchInput.value = '';
  renderList();
  searchInput?.focus();

  outsideClickHandler = (e: MouseEvent) => {
    if (!popup) return;
    const target = e.target as Node;
    if (popup.contains(target)) return;
    const btn = (e.target as HTMLElement)?.closest?.('[data-action="quick-cmd"]');
    if (btn) return;
    closePopup();
  };
  keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopup();
  };
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClickHandler!, true);
    document.addEventListener('keydown', keyHandler!, true);
  }, 0);
}

function closePopup(): void {
  if (!popup) return;
  popup.classList.add('hidden');
  if (outsideClickHandler) document.removeEventListener('mousedown', outsideClickHandler, true);
  if (keyHandler) document.removeEventListener('keydown', keyHandler, true);
  outsideClickHandler = null;
  keyHandler = null;
}

function folderNameOf(cwd: string): string {
  return cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || cwd;
}

function buildPopup(): HTMLElement {
  const el = document.createElement('div');
  el.id = POPUP_ID;
  el.className = 'hidden';
  el.innerHTML = `
    <div class="qcmd-header">
      <div>
        <div class="qcmd-header-title">빠른 명령</div>
        <div class="qcmd-header-cwd"></div>
      </div>
      <div class="qcmd-header-actions">
        <button class="icon-btn" data-action="add" title="새 명령 추가">+</button>
        <button class="icon-btn" data-action="close" title="닫기">✕</button>
      </div>
    </div>
    <div class="qcmd-search">
      <input type="text" placeholder="빠른 명령 검색..." spellcheck="false" autocomplete="off">
    </div>
    <div class="qcmd-list"></div>
  `;
  document.body.appendChild(el);

  searchInput = el.querySelector('input') as HTMLInputElement;
  listEl = el.querySelector('.qcmd-list') as HTMLElement;

  searchInput.addEventListener('input', () => renderList());
  el.querySelector('[data-action="close"]')?.addEventListener('click', () => closePopup());
  el.querySelector('[data-action="add"]')?.addEventListener('click', () => {
    editingId = null;
    addingNew = true;
    renderList();
  });

  return el;
}

function renderList(): void {
  if (!listEl) return;
  const filter = searchInput?.value || '';
  const named = getNamedCommands(currentCwd, filter);

  const parts: string[] = [];

  if (addingNew) {
    parts.push(renderForm(null));
  }

  if (named.length === 0 && !addingNew) {
    parts.push(`<div class="qcmd-empty">${filter ? '일치하는 명령이 없습니다.' : '이 디렉토리에 저장된 빠른 명령이 없습니다.<br>+ 버튼으로 이름을 붙여 저장하세요.'}</div>`);
  } else {
    for (const entry of named) {
      parts.push(editingId === entry.id ? renderForm(entry) : renderNamedRow(entry));
    }
  }

  parts.push(`<div class="qcmd-section-toggle" data-action="toggle-history">${historyExpanded ? '▽' : '▷'} 명령</div>`);
  if (historyExpanded) {
    parts.push(renderHistorySection(filter));
  }

  listEl.innerHTML = parts.join('');
  bindListEvents();
}

function renderForm(entry: NamedCommand | null): string {
  return `
    <div class="qcmd-form" data-id="${entry ? escapeHtml(entry.id) : ''}">
      <input class="qcmd-form-name" placeholder="이름 (예: run)" value="${entry ? escapeHtml(entry.name) : ''}">
      <textarea class="qcmd-form-cmd" placeholder="명령어" rows="3" spellcheck="false">${entry ? escapeHtml(entry.command) : ''}</textarea>
      <div class="qcmd-form-actions">
        <button class="icon-btn" data-act="save" title="저장">✓</button>
        <button class="icon-btn" data-act="cancel" title="취소">✕</button>
      </div>
    </div>
  `;
}

function renderNamedRow(entry: NamedCommand): string {
  return `
    <div class="qcmd-item" data-id="${escapeHtml(entry.id)}" title="클릭: 바로 실행">
      <div class="qcmd-item-main">
        <span class="qcmd-item-name">▶ ${escapeHtml(entry.name)}</span>
        <span class="qcmd-item-cmd">${escapeHtml(entry.command)}</span>
      </div>
      <span class="qcmd-item-actions">
        <button class="icon-btn" data-act="edit" title="수정">✎</button>
        <button class="icon-btn" data-act="delete" title="삭제">✕</button>
      </span>
    </div>
  `;
}

function renderHistorySection(filter: string): string {
  const items = getTopCommands(MAX_HISTORY_ITEMS, filter);
  if (items.length === 0) {
    return `<div class="qcmd-empty">${filter ? '일치하는 기록이 없습니다.' : '아직 자동 기록된 명령이 없습니다.'}</div>`;
  }
  return items.map((item) => `
    <div class="fcmd-item qcmd-history-item" data-cmd="${escapeHtml(item.cmd)}" title="클릭: 입력, Shift+클릭: 실행">
      <span class="fcmd-item-text">${escapeHtml(item.cmd)}</span>
      <span class="fcmd-item-count">${item.count}</span>
      <span class="fcmd-item-actions">
        <button class="icon-btn" data-act="run" title="실행 (Enter 포함)">▶</button>
        <button class="icon-btn" data-act="delete" title="삭제">✕</button>
      </span>
    </div>
  `).join('');
}

function bindListEvents(): void {
  if (!listEl) return;

  // 이름있는 명령 행 — 클릭 시 바로 실행
  listEl.querySelectorAll<HTMLElement>('.qcmd-item').forEach((row) => {
    const id = row.dataset.id!;
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actBtn = target.closest('[data-act]') as HTMLElement | null;
      if (actBtn) {
        e.stopPropagation();
        const act = actBtn.dataset.act;
        if (act === 'delete') {
          deleteNamedCommand(id);
          renderList();
          triggerContentRender();
        } else if (act === 'edit') {
          addingNew = false;
          editingId = id;
          renderList();
        }
        return;
      }
      const entry = getNamedCommands(currentCwd).find((n) => n.id === id);
      if (entry) {
        runInFocusedPanel(entry.command);
        touchNamedCommand(entry.id);
        closePopup();
        triggerContentRender();
      }
    });
  });

  // 추가/수정 폼
  listEl.querySelectorAll<HTMLElement>('.qcmd-form').forEach((form) => {
    const id = form.dataset.id || null;
    const nameInput = form.querySelector('.qcmd-form-name') as HTMLInputElement;
    const cmdInput = form.querySelector('.qcmd-form-cmd') as HTMLTextAreaElement;
    nameInput?.focus();

    const commit = (): void => {
      if (id) updateNamedCommand(id, nameInput.value, cmdInput.value);
      else addNamedCommand(nameInput.value, cmdInput.value, currentCwd);
      addingNew = false;
      editingId = null;
      renderList();
      triggerContentRender();
    };
    const cancel = (): void => {
      addingNew = false;
      editingId = null;
      renderList();
    };

    form.querySelector('[data-act="save"]')?.addEventListener('click', (e) => { e.stopPropagation(); commit(); });
    form.querySelector('[data-act="cancel"]')?.addEventListener('click', (e) => { e.stopPropagation(); cancel(); });
    [nameInput, cmdInput].forEach((input) => {
      input?.addEventListener('keydown', ((e: KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
      }) as EventListener);
    });
  });

  // 섹션 토글
  listEl.querySelector('[data-action="toggle-history"]')?.addEventListener('click', () => {
    historyExpanded = !historyExpanded;
    renderList();
  });

  // 빈도 기록 목록(기존 자주쓰는 명령어와 동일한 상호작용)
  listEl.querySelectorAll<HTMLElement>('.qcmd-history-item').forEach((row) => {
    const cmd = row.dataset.cmd!;
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actBtn = target.closest('[data-act]') as HTMLElement | null;
      if (actBtn) {
        e.stopPropagation();
        const act = actBtn.dataset.act;
        if (act === 'delete') {
          deleteCommand(cmd);
          renderList();
        } else if (act === 'run') {
          insertIntoFocusedPanel(cmd, true);
          closePopup();
        }
        return;
      }
      insertIntoFocusedPanel(cmd, e.shiftKey);
      closePopup();
    });
  });
}

function runInFocusedPanel(cmd: string): void {
  insertIntoFocusedPanel(cmd, true);
}

/** 포커스된 터미널에 명령어를 paste한다. execute=true면 끝에 \r을 추가해 즉시 실행 */
function insertIntoFocusedPanel(cmd: string, execute: boolean): void {
  const panelId = state.focusedPanelId;
  if (!panelId) {
    alert('터미널 패널에 먼저 포커스하세요.');
    return;
  }
  const inst = state.terminalInstances.get(panelId);
  if (!inst) {
    alert('포커스된 패널이 터미널이 아닙니다.');
    return;
  }
  pasteTextToPanel(panelId, execute ? `${cmd}\r` : cmd);
  if (execute) recordCommand(cmd);
  inst.terminal.focus();
}

// ── 패널 헤더의 실행 버튼(▶ <이름>) ──

/** 헤더의 ▶ 버튼 클릭 시 호출 — 즉시 실행하고 "마지막 사용"을 갱신해 대표 명령으로 유지한다 */
export function runNamedCommandInPanel(panelId: string, entry: NamedCommand): void {
  state.focusedPanelId = panelId;
  const inst = state.terminalInstances.get(panelId);
  if (!inst) return;
  pasteTextToPanel(panelId, `${entry.command}\r`);
  recordCommand(entry.command);
  touchNamedCommand(entry.id);
  inst.terminal.focus();
  triggerContentRender();
}

// ── 패널 헤더의 ⌄ 드롭다운 (여러 개 등록된 경우 선택/수정/삭제) ──

let dropdownPopup: HTMLElement | null = null;
let dropdownOutsideClick: ((e: MouseEvent) => void) | null = null;

function closeDropdown(): void {
  if (!dropdownPopup) return;
  dropdownPopup.remove();
  dropdownPopup = null;
  if (dropdownOutsideClick) document.removeEventListener('mousedown', dropdownOutsideClick, true);
  dropdownOutsideClick = null;
}

/** 헤더의 ⌄ 버튼 클릭 시 호출 — 이 디렉토리에 등록된 명령 전체를 작게 나열한다 */
export function openQuickLaunchDropdown(anchor: HTMLElement, panelId: string, cwd: string): void {
  if (dropdownPopup) {
    closeDropdown();
    return;
  }

  const entries = getNamedCommands(cwd);
  const el = document.createElement('div');
  el.id = 'quick-launch-dropdown';
  el.innerHTML = entries.map((entry) => `
    <div class="qcmd-item" data-id="${escapeHtml(entry.id)}" title="클릭: 실행">
      <div class="qcmd-item-main">
        <span class="qcmd-item-name">▶ ${escapeHtml(entry.name)}</span>
        <span class="qcmd-item-cmd">${escapeHtml(entry.command)}</span>
      </div>
      <span class="qcmd-item-actions">
        <button class="icon-btn" data-act="edit" title="수정">✎</button>
        <button class="icon-btn" data-act="delete" title="삭제">✕</button>
      </span>
    </div>
  `).join('');
  document.body.appendChild(el);
  dropdownPopup = el;

  const rect = anchor.getBoundingClientRect();
  // 드롭다운 실제 너비(360px, #quick-launch-dropdown)만큼 뷰포트 안에 들어오도록 클램프
  const left = Math.min(window.innerWidth - 368, rect.left);
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.min(window.innerHeight - 200, rect.bottom + 4)}px`;

  el.querySelectorAll<HTMLElement>('.qcmd-item').forEach((row) => {
    const id = row.dataset.id!;
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actBtn = target.closest('[data-act]') as HTMLElement | null;
      if (actBtn) {
        e.stopPropagation();
        const act = actBtn.dataset.act;
        if (act === 'delete') {
          deleteNamedCommand(id);
          closeDropdown();
          triggerContentRender();
        } else if (act === 'edit') {
          closeDropdown();
          openCommandEditor(anchor, entry);
        }
        return;
      }
      closeDropdown();
      runNamedCommandInPanel(panelId, entry);
    });
  });

  setTimeout(() => {
    dropdownOutsideClick = (e: MouseEvent) => {
      if (dropdownPopup && !dropdownPopup.contains(e.target as Node)) closeDropdown();
    };
    document.addEventListener('mousedown', dropdownOutsideClick, true);
  }, 0);
}

// ── 패널 헤더 실행 아이콘의 수정 팝오버 ──

let editorPopup: HTMLElement | null = null;
let editorOutsideClick: ((e: MouseEvent) => void) | null = null;
let editorKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function closeEditor(): void {
  if (!editorPopup) return;
  editorPopup.remove();
  editorPopup = null;
  if (editorOutsideClick) document.removeEventListener('mousedown', editorOutsideClick, true);
  if (editorKeyHandler) document.removeEventListener('keydown', editorKeyHandler, true);
  editorOutsideClick = null;
  editorKeyHandler = null;
}

/** 헤더 실행 아이콘의 ✎ 버튼 클릭 시 호출 — 이름/명령 수정 + 삭제가 가능한 작은 팝오버를 연다 */
export function openCommandEditor(anchor: HTMLElement, entry: NamedCommand): void {
  closeEditor();

  const el = document.createElement('div');
  el.id = 'quick-command-editor-popup';
  el.innerHTML = `
    <div class="qcmd-form">
      <input class="qcmd-form-name" placeholder="이름" value="${escapeHtml(entry.name)}">
      <textarea class="qcmd-form-cmd" placeholder="명령어" rows="3" spellcheck="false">${escapeHtml(entry.command)}</textarea>
      <div class="qcmd-form-actions">
        <button class="icon-btn" data-act="delete" title="삭제">🗑</button>
        <button class="icon-btn" data-act="save" title="저장">✓</button>
        <button class="icon-btn" data-act="cancel" title="취소">✕</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  editorPopup = el;

  const rect = anchor.getBoundingClientRect();
  // 편집 팝오버 실제 너비(360px, #quick-command-editor-popup)만큼 뷰포트 안에 들어오도록 클램프
  const left = Math.min(window.innerWidth - 368, rect.left);
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.min(window.innerHeight - 160, rect.bottom + 6)}px`;

  const nameInput = el.querySelector('.qcmd-form-name') as HTMLInputElement;
  const cmdInput = el.querySelector('.qcmd-form-cmd') as HTMLTextAreaElement;
  nameInput.focus();
  nameInput.select();

  const commit = (): void => {
    updateNamedCommand(entry.id, nameInput.value, cmdInput.value);
    closeEditor();
    triggerContentRender();
  };
  el.querySelector('[data-act="save"]')?.addEventListener('click', (e) => { e.stopPropagation(); commit(); });
  el.querySelector('[data-act="cancel"]')?.addEventListener('click', (e) => { e.stopPropagation(); closeEditor(); });
  el.querySelector('[data-act="delete"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteNamedCommand(entry.id);
    closeEditor();
    triggerContentRender();
  });
  [nameInput, cmdInput].forEach((input) => {
    input.addEventListener('keydown', ((e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.stopPropagation(); closeEditor(); }
    }) as EventListener);
  });

  setTimeout(() => {
    editorOutsideClick = (e: MouseEvent) => {
      if (editorPopup && !editorPopup.contains(e.target as Node)) closeEditor();
    };
    editorKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEditor();
    };
    document.addEventListener('mousedown', editorOutsideClick, true);
    document.addEventListener('keydown', editorKeyHandler, true);
  }, 0);
}
