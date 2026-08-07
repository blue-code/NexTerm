/**
 * 새 패널 런처 팝업
 * 패널 헤더의 분할 버튼(⇥/⤓) 클릭 시 표시 — 어떤 셸로 열지, 또는 어떤 AI를
 * (일반/권한 스킵 중 어느 쪽으로) 자동 실행할지 검색해서 고른다.
 * 셸만 고르면 splitPanel({ shell })만 호출하고, AI를 고르면 셸이 준비된 뒤
 * 자동 입력할 initialCommand를 함께 넘긴다.
 */
import { state } from './state';
import { splitPanel } from './workspace';
import { escapeHtml } from './utils';

const POPUP_ID = 'panel-launcher-popup';

interface LaunchOption {
  id: string;
  label: string;
  hint: string;
  shell?: string;
  initialCommand?: string;
}

// 검증된 CLI 플래그만 사용 (각 CLI --help로 확인):
// claude --dangerously-skip-permissions / codex --dangerously-bypass-approvals-and-sandbox /
// grok --always-approve / agy --dangerously-skip-permissions / hermes chat --yolo
const SHELL_OPTIONS: LaunchOption[] = [
  { id: 'powershell', label: 'PowerShell', hint: '셸', shell: 'powershell.exe' },
  { id: 'cmd', label: 'CMD', hint: '셸', shell: 'cmd.exe' },
  { id: 'git-bash', label: 'Git Bash', hint: '셸', shell: 'git-bash' },
];

const AI_OPTIONS: LaunchOption[] = [
  { id: 'claude', label: 'Claude Code', hint: 'AI', initialCommand: 'claude' },
  { id: 'claude-skip', label: 'Claude Code (권한 스킵)', hint: 'AI', initialCommand: 'claude --dangerously-skip-permissions' },
  { id: 'codex', label: 'Codex', hint: 'AI', initialCommand: 'codex' },
  { id: 'codex-skip', label: 'Codex (권한 스킵)', hint: 'AI', initialCommand: 'codex --dangerously-bypass-approvals-and-sandbox' },
  { id: 'grok', label: 'Grok', hint: 'AI', initialCommand: 'grok' },
  { id: 'grok-skip', label: 'Grok (권한 스킵)', hint: 'AI', initialCommand: 'grok --always-approve' },
  { id: 'antigravity', label: 'Antigravity', hint: 'AI', initialCommand: 'agy' },
  { id: 'antigravity-skip', label: 'Antigravity (권한 스킵)', hint: 'AI', initialCommand: 'agy --dangerously-skip-permissions' },
  { id: 'hermes', label: 'Hermes', hint: 'AI', initialCommand: 'hermes chat' },
  { id: 'hermes-skip', label: 'Hermes (권한 스킵)', hint: 'AI', initialCommand: 'hermes chat --yolo' },
];

const ALL_OPTIONS = [...SHELL_OPTIONS, ...AI_OPTIONS];

let popup: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;
let listEl: HTMLElement | null = null;
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let pendingDirection: 'horizontal' | 'vertical' = 'horizontal';
let pendingPanelId: string | null = null;

/** 분할 버튼 클릭 시 호출 — 셸/AI 선택 팝업을 연다 */
export function openPanelLauncher(
  direction: 'horizontal' | 'vertical',
  panelId: string,
  anchor: HTMLElement,
): void {
  pendingDirection = direction;
  pendingPanelId = panelId;
  state.focusedPanelId = panelId;

  if (!popup) popup = buildPopup();
  popup.classList.remove('hidden');

  const rect = anchor.getBoundingClientRect();
  const left = Math.min(window.innerWidth - 340, rect.left);
  const top = Math.min(window.innerHeight - 400, rect.bottom + 6);
  popup.style.left = `${Math.max(8, left)}px`;
  popup.style.top = `${Math.max(8, top)}px`;

  if (searchInput) searchInput.value = '';
  renderList('');
  searchInput?.focus();

  setTimeout(() => {
    outsideClickHandler = (e: MouseEvent) => {
      if (!popup || popup.contains(e.target as Node)) return;
      closePopup();
    };
    keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopup();
    };
    document.addEventListener('mousedown', outsideClickHandler, true);
    document.addEventListener('keydown', keyHandler, true);
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
    <div class="plauncher-search">
      <input type="text" placeholder="셸/AI 검색..." spellcheck="false" autocomplete="off">
    </div>
    <div class="plauncher-list"></div>
  `;
  document.body.appendChild(el);

  searchInput = el.querySelector('input') as HTMLInputElement;
  listEl = el.querySelector('.plauncher-list') as HTMLElement;
  searchInput.addEventListener('input', () => renderList(searchInput!.value));

  return el;
}

function renderList(filter: string): void {
  if (!listEl) return;
  const q = filter.trim().toLowerCase();
  const shellItems = SHELL_OPTIONS.filter(o => o.label.toLowerCase().includes(q));
  const aiItems = AI_OPTIONS.filter(o => o.label.toLowerCase().includes(q));

  if (shellItems.length === 0 && aiItems.length === 0) {
    listEl.innerHTML = '<div class="plauncher-empty">일치하는 항목이 없습니다.</div>';
    return;
  }

  const rowHtml = (o: LaunchOption): string => `
    <div class="plauncher-item" data-id="${escapeHtml(o.id)}">
      <span class="plauncher-item-label">${escapeHtml(o.label)}</span>
      <span class="plauncher-item-hint">${escapeHtml(o.hint)}</span>
    </div>
  `;

  listEl.innerHTML = `
    ${shellItems.length > 0 ? `<div class="plauncher-section">터미널 셸</div>${shellItems.map(rowHtml).join('')}` : ''}
    ${aiItems.length > 0 ? `<div class="plauncher-section">AI 에이전트</div>${aiItems.map(rowHtml).join('')}` : ''}
  `;

  listEl.querySelectorAll('.plauncher-item').forEach((row) => {
    row.addEventListener('click', () => {
      const id = (row as HTMLElement).dataset.id;
      const option = ALL_OPTIONS.find(o => o.id === id);
      if (option) selectOption(option);
      closePopup();
    });
  });
}

function selectOption(option: LaunchOption): void {
  if (!pendingPanelId) return;
  state.focusedPanelId = pendingPanelId;
  splitPanel(pendingDirection, {
    shell: option.shell,
    initialCommand: option.initialCommand,
  });
}
