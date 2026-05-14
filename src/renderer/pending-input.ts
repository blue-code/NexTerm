/**
 * "다음 명령 제안" (pending input) 관리
 *
 * 외부 도구(Claude Code, CLI, frequent-commands 등)가 사용자의 터미널 입력창에
 * 명령을 "예약"할 수 있게 한다. PTY에는 아직 쓰지 않고, 사용자의 다음 키 입력에 따라
 *
 *  - Enter           → 예약된 명령을 paste 후 즉시 실행
 *  - 화살표·Home·End → 입력창에 paste만 하고 커서를 이동(편집 가능 상태로 커밋)
 *  - 일반 문자 키    → 제안 폐기, 사용자가 친 문자만 입력됨
 *
 * 시각 힌트: 패널 상단에 "다음 명령: <cmd>" 배너를 띄운다.
 * 직접 ✕ 버튼으로 폐기 가능.
 */
import { state } from './state';
import { pasteTextToPanel, fitTerminal } from './terminal';
import { escapeHtml } from './utils';

/** 패널에 제안을 등록한다. 기존 제안은 덮어쓴다. */
export function setPendingInput(panelId: string, text: string): void {
  if (!text) {
    clearPendingInput(panelId);
    return;
  }
  state.pendingInputs.set(panelId, text);
  renderHint(panelId);
}

/** 제안을 폐기한다. */
export function clearPendingInput(panelId: string): void {
  if (state.pendingInputs.has(panelId)) {
    state.pendingInputs.delete(panelId);
  }
  removeHint(panelId);
}

/** 현재 제안 텍스트를 반환한다. 없으면 undefined. */
export function getPendingInput(panelId: string): string | undefined {
  return state.pendingInputs.get(panelId);
}

/**
 * 사용자의 키 이벤트를 받아 제안을 어떻게 처리할지 판단한다.
 * - 호출자는 keydown 이벤트에서만 호출해야 한다.
 * - 반환:
 *    'consumed': 제안이 키 이벤트를 흡수해 처리함. 호출자는 기본 동작을 막아야 한다 (xterm 미전달).
 *    'committed': 제안을 입력창에 paste 함. 호출자는 키 이벤트는 그대로 통과시켜야 한다.
 *    'discarded': 제안 폐기. 호출자는 키 이벤트를 그대로 통과시킨다.
 *    'pass'    : 제안이 없거나 관련 없는 키. 호출자는 평소대로 진행.
 */
export type PendingDecision = 'consumed' | 'committed' | 'discarded' | 'pass';

export function handleKeyAgainstPending(panelId: string, e: KeyboardEvent): PendingDecision {
  const pending = state.pendingInputs.get(panelId);
  if (!pending) return 'pass';

  // 단순 수정자 키 단독 입력은 무시 (Shift, Ctrl, Alt만 누른 상태)
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
    return 'pass';
  }

  // Enter (단독) → 즉시 실행
  if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
    pasteTextToPanel(panelId, pending + '\r');
    clearPendingInput(panelId);
    return 'consumed';
  }

  // 커서 이동 / 편집 위치 변경 키 → 제안을 입력창에 커밋
  // 사용자가 화살표 등을 눌렀으니 입력 라인이 활성 상태여야 함 → paste 후 키는 그대로 셸에 전달
  const COMMIT_KEYS = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End', 'PageUp', 'PageDown',
  ]);
  if (COMMIT_KEYS.has(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    pasteTextToPanel(panelId, pending);
    clearPendingInput(panelId);
    return 'committed';
  }

  // Esc → 단순 폐기
  if (e.key === 'Escape') {
    clearPendingInput(panelId);
    return 'consumed';
  }

  // Ctrl/Alt/Meta 조합(앱 단축키) → 제안 유지, 기본 동작 통과
  if (e.ctrlKey || e.altKey || e.metaKey) {
    return 'pass';
  }

  // 일반 문자 / Backspace / Tab 등 → 제안 폐기 후 키는 그대로 통과
  // (사용자가 새 명령을 직접 타이핑하기 시작했다는 신호)
  const LOOKS_LIKE_INPUT = e.key.length === 1
    || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab';
  if (LOOKS_LIKE_INPUT) {
    clearPendingInput(panelId);
    return 'discarded';
  }

  return 'pass';
}

// ── 시각 힌트 (패널 상단 배너) ──

function hintIdFor(panelId: string): string {
  return `pending-hint-${panelId}`;
}

function renderHint(panelId: string): void {
  removeHint(panelId);
  const text = state.pendingInputs.get(panelId);
  if (!text) return;

  const pane = document.querySelector(`.split-pane[data-panel-id="${panelId}"]`) as HTMLElement | null;
  if (!pane) return; // 패널이 아직 마운트되지 않은 경우 — 마운트되면 다시 render 호출 필요

  const hint = document.createElement('div');
  hint.className = 'pending-input-hint';
  hint.id = hintIdFor(panelId);
  hint.innerHTML = `
    <span class="pending-input-hint-label">다음 명령</span>
    <span class="pending-input-hint-cmd">${escapeHtml(text)}</span>
    <span class="pending-input-hint-help">Enter 실행 · 타이핑 취소 · ← → 편집</span>
    <button class="pending-input-hint-close" title="취소">✕</button>
  `;

  hint.querySelector('.pending-input-hint-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    clearPendingInput(panelId);
  });

  // 패널 헤더 바로 아래에 삽입
  const header = pane.querySelector('.panel-header');
  if (header && header.nextSibling) {
    pane.insertBefore(hint, header.nextSibling);
  } else {
    pane.appendChild(hint);
  }

  // 힌트가 들어오면서 터미널 mount 높이가 줄어들므로 xterm 재계산
  refitPanelTerminal(panelId);
}

function removeHint(panelId: string): void {
  const el = document.getElementById(hintIdFor(panelId));
  if (el) {
    el.remove();
    refitPanelTerminal(panelId);
  }
}

function refitPanelTerminal(panelId: string): void {
  const inst = state.terminalInstances.get(panelId);
  if (!inst) return;
  // 다음 프레임에 fit — DOM 갱신 후 측정
  requestAnimationFrame(() => fitTerminal(inst));
}

/** 패널 재렌더 후 힌트를 다시 그려준다 (workspace.ts/render.ts에서 호출). */
export function refreshPendingHint(panelId: string): void {
  if (state.pendingInputs.has(panelId)) renderHint(panelId);
}

/** 패널이 닫힐 때 정리 */
export function dropPendingInput(panelId: string): void {
  clearPendingInput(panelId);
}
