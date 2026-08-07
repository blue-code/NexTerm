/**
 * 빠른 명령 팝업 (패널 헤더의 ★ 버튼에서 연다)
 *
 * 사이드바의 기존 "자주쓰는 명령어"(frequent-commands.ts, 자동 빈도 추적)와는 별개로,
 * 사용자가 이름을 붙여 저장한 명령어(named-commands.ts)를 우선 보여주고,
 * 자동 빈도 목록은 "▷ 명령" 섹션 안에 접어둔다.
 */
import { state } from './state';
import {
  getNamedCommands,
  addNamedCommand,
  updateNamedCommand,
  deleteNamedCommand,
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
let addingNew = false;
let editingId: string | null = null;
let historyExpanded = false;

/** 패널 헤더 ★ 버튼 클릭 시 토글 호출 */
export function toggleQuickCommands(anchor?: HTMLElement): void {
  if (popup && !popup.classList.contains('hidden')) {
    closePopup();
    return;
  }
  openPopup(anchor);
}

function openPopup(anchor?: HTMLElement): void {
  if (!popup) popup = buildPopup();
  popup.classList.remove('hidden');

  addingNew = false;
  editingId = null;
  historyExpanded = false;

  const rect = anchor?.getBoundingClientRect();
  if (rect) {
    const left = Math.min(window.innerWidth - 380, rect.left);
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

function buildPopup(): HTMLElement {
  const el = document.createElement('div');
  el.id = POPUP_ID;
  el.className = 'hidden';
  el.innerHTML = `
    <div class="qcmd-header">
      <div class="qcmd-header-title">빠른 명령</div>
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
  const named = getNamedCommands(filter);

  const parts: string[] = [];

  if (addingNew) {
    parts.push(renderForm(null));
  }

  if (named.length === 0 && !addingNew) {
    parts.push(`<div class="qcmd-empty">${filter ? '일치하는 명령이 없습니다.' : '저장된 빠른 명령이 없습니다.<br>+ 버튼으로 이름을 붙여 저장하세요.'}</div>`);
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
      <input class="qcmd-form-cmd" placeholder="명령어" value="${entry ? escapeHtml(entry.command) : ''}">
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
        } else if (act === 'edit') {
          addingNew = false;
          editingId = id;
          renderList();
        }
        return;
      }
      const entry = getNamedCommands().find((n) => n.id === id);
      if (entry) {
        runInFocusedPanel(entry.command);
        closePopup();
      }
    });
  });

  // 추가/수정 폼
  listEl.querySelectorAll<HTMLElement>('.qcmd-form').forEach((form) => {
    const id = form.dataset.id || null;
    const nameInput = form.querySelector('.qcmd-form-name') as HTMLInputElement;
    const cmdInput = form.querySelector('.qcmd-form-cmd') as HTMLInputElement;
    nameInput?.focus();

    const commit = (): void => {
      if (id) updateNamedCommand(id, nameInput.value, cmdInput.value);
      else addNamedCommand(nameInput.value, cmdInput.value);
      addingNew = false;
      editingId = null;
      renderList();
    };
    const cancel = (): void => {
      addingNew = false;
      editingId = null;
      renderList();
    };

    form.querySelector('[data-act="save"]')?.addEventListener('click', (e) => { e.stopPropagation(); commit(); });
    form.querySelector('[data-act="cancel"]')?.addEventListener('click', (e) => { e.stopPropagation(); cancel(); });
    [nameInput, cmdInput].forEach((input) => {
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
      });
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
