/**
 * 자주쓰는 명령어 팝업
 * 사이드바 하단 버튼에서 토글. 클릭 시 포커스된 터미널에 해당 명령어를 paste한다.
 * Shift+클릭 또는 → 버튼: paste + Enter(실행).
 */
import { state } from './state';
import {
  getTopCommands,
  deleteCommand,
  clearAllCommands,
  recordCommand,
} from './command-history';
import { pasteTextToPanel } from './terminal';
import { escapeHtml } from './utils';

const POPUP_ID = 'frequent-commands-popup';
const MAX_ITEMS = 50;

let popup: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

/** 사이드바 버튼 클릭 시 토글 호출 */
export function toggleFrequentCommands(anchor?: HTMLElement): void {
  if (popup && !popup.classList.contains('hidden')) {
    closePopup();
    return;
  }
  openPopup(anchor);
}

function openPopup(anchor?: HTMLElement): void {
  if (!popup) popup = buildPopup();
  popup.classList.remove('hidden');

  // 앵커(버튼) 옆에 배치 — 버튼 우측 위쪽으로 띄움
  const rect = anchor?.getBoundingClientRect();
  if (rect) {
    const left = Math.min(window.innerWidth - 380, rect.right + 8);
    const top = Math.max(8, rect.top - 8 - 320);
    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top = `${top}px`;
  } else {
    popup.style.left = '60px';
    popup.style.bottom = '12px';
    popup.style.top = 'auto';
  }

  renderList();
  searchInput?.focus();

  // 외부 클릭/Esc 닫기
  outsideClickHandler = (e: MouseEvent) => {
    if (!popup) return;
    const target = e.target as Node;
    if (popup.contains(target)) return;
    // 토글 버튼 자체 클릭은 closePopup → toggleFrequentCommands 흐름에 맡김
    const btn = document.getElementById('btn-frequent-commands');
    if (btn && btn.contains(target)) return;
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
    <div class="fcmd-header">
      <div class="fcmd-header-title">자주쓰는 명령어</div>
      <div class="fcmd-header-actions">
        <button class="icon-btn" data-action="clear" title="전체 삭제">🗑</button>
        <button class="icon-btn" data-action="close" title="닫기">✕</button>
      </div>
    </div>
    <div class="fcmd-search">
      <input type="text" placeholder="필터..." spellcheck="false" autocomplete="off">
    </div>
    <div class="fcmd-list"></div>
  `;
  document.body.appendChild(el);

  searchInput = el.querySelector('input') as HTMLInputElement;
  listEl = el.querySelector('.fcmd-list') as HTMLElement;

  searchInput.addEventListener('input', () => renderList());
  el.querySelector('[data-action="close"]')?.addEventListener('click', () => closePopup());
  el.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
    if (confirm('자주쓰는 명령어 기록을 모두 삭제할까요?')) {
      clearAllCommands();
      renderList();
    }
  });

  return el;
}

function renderList(): void {
  if (!listEl) return;
  const filter = searchInput?.value || '';
  const items = getTopCommands(MAX_ITEMS, filter);

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="fcmd-empty">
        ${filter ? '일치하는 명령어가 없습니다.' : '아직 기록된 명령어가 없습니다.<br>터미널에서 명령을 실행하면 자동으로 누적됩니다.'}
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'fcmd-item';
    row.title = '클릭: 입력, Shift+클릭: 실행';
    row.innerHTML = `
      <span class="fcmd-item-text">${escapeHtml(item.cmd)}</span>
      <span class="fcmd-item-count">${item.count}</span>
      <span class="fcmd-item-actions">
        <button class="icon-btn" data-act="run" title="실행 (Enter 포함)">▶</button>
        <button class="icon-btn" data-act="delete" title="삭제">✕</button>
      </span>
    `;

    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const actBtn = target.closest('[data-act]') as HTMLElement | null;
      if (actBtn) {
        e.stopPropagation();
        const act = actBtn.dataset.act;
        if (act === 'delete') {
          deleteCommand(item.cmd);
          renderList();
        } else if (act === 'run') {
          insertCommandIntoFocusedPanel(item.cmd, true);
          closePopup();
        }
        return;
      }
      insertCommandIntoFocusedPanel(item.cmd, e.shiftKey);
      closePopup();
    });

    listEl.appendChild(row);
  }
}

/**
 * 포커스된 터미널에 명령어를 paste한다.
 * execute=true 이면 끝에 \r을 추가해 즉시 실행.
 */
function insertCommandIntoFocusedPanel(cmd: string, execute: boolean): void {
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
  // paste 경로는 빈도 추적에서 제외되므로, 팝업에서 "실행"한 경우만
  // 직접 카운트를 올려 사용 빈도를 유지한다 (삽입만 한 경우는 미실행일 수 있어 제외)
  if (execute) recordCommand(cmd);
  inst.terminal.focus();
}
