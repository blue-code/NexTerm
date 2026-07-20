/**
 * 하단 상태바 — AI 도구 사용량 표시
 *
 * 설정(usageProvider)에서 지정한 제공자의 사용량/남은 시간/주간 사용량을
 * 주기적으로(usageRefreshIntervalSec) main에 조회해 표시한다.
 * ↻ 버튼으로 즉시 새로고침(force) 가능 — main 쪽에서 30초 하한으로 보호된다.
 *
 * 상태바 자체는 항상 표시한다 (복사/붙여넣기 단축키 안내를 상시 노출해야 하므로).
 * provider가 'none'이면 사용량 영역과 새로고침 버튼만 숨긴다.
 */
import { state, electronAPI } from './state';
import { fitAllTerminals } from './terminal';
import { formatRemaining, formatPercent } from '../shared/usage-format';
import { escapeHtml } from './utils';
import type { UsageProviderId, UsageSnapshot } from '../shared/types';

const PROVIDER_LABELS: Record<UsageProviderId, string> = {
  none: '',
  claude: 'Claude Code',
  codex: 'Codex',
  antigravity: 'Antigravity',
};

const DEFAULT_INTERVAL_SEC = 300;
const MIN_INTERVAL_SEC = 30;

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let repaintTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshot: UsageSnapshot | null = null;
let refreshing = false;

function currentProvider(): UsageProviderId {
  return (state.settings?.usageProvider as UsageProviderId) || 'none';
}

function currentIntervalMs(): number {
  const sec = state.settings?.usageRefreshIntervalSec || DEFAULT_INTERVAL_SEC;
  return Math.max(MIN_INTERVAL_SEC, sec) * 1000;
}

/** 앱 초기화 시 1회 호출 */
export function initUsageStatus(): void {
  document.getElementById('btn-usage-refresh')?.addEventListener('click', () => {
    void refreshUsage(true);
  });
  applyUsageProvider();
}

/** 설정 변경(제공자/주기) 시 호출 — 사용량 영역 토글 + 폴링 재시작 */
export function applyUsageProvider(): void {
  const bar = document.getElementById('statusbar');
  const visible = currentProvider() !== 'none';

  // 상태바는 단축키 안내 때문에 항상 표시, 사용량 영역만 제공자 설정에 따라 토글
  document.body.classList.add('has-statusbar');
  bar?.classList.remove('hidden');
  document.getElementById('usage-status')?.classList.toggle('hidden', !visible);
  document.getElementById('btn-usage-refresh')?.classList.toggle('hidden', !visible);
  // 상태바 표시로 콘텐츠 높이가 변할 수 있으므로 터미널 재계산
  fitAllTerminals();

  stopPolling();
  if (visible) {
    void refreshUsage(false);
    schedule();
    // 남은 시간 표시가 폴링 주기 사이에 낡지 않도록 1분마다 재계산해 다시 그린다
    repaintTimer = setInterval(() => {
      if (lastSnapshot) renderSnapshot(lastSnapshot);
    }, 60_000);
  }
}

function schedule(): void {
  stopPolling();
  pollTimer = setTimeout(() => {
    void refreshUsage(false).finally(() => schedule());
  }, currentIntervalMs());
}

function stopPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (repaintTimer) {
    clearInterval(repaintTimer);
    repaintTimer = null;
  }
}

async function refreshUsage(force: boolean): Promise<void> {
  const provider = currentProvider();
  if (provider === 'none' || refreshing) return;

  refreshing = true;
  const btn = document.getElementById('btn-usage-refresh');
  btn?.classList.add('spinning');
  try {
    const snapshot = await electronAPI.invoke('usage:get', { provider, force }) as UsageSnapshot;
    lastSnapshot = snapshot;
    renderSnapshot(snapshot);
  } catch {
    renderText(`${PROVIDER_LABELS[provider]} · 사용량 조회 실패`);
  } finally {
    refreshing = false;
    btn?.classList.remove('spinning');
  }
}

function renderSnapshot(snap: UsageSnapshot): void {
  const providerLabel = PROVIDER_LABELS[snap.provider] || snap.provider;

  if (!snap.ok) {
    renderText(`${providerLabel} · ${snap.error || '사용량 정보 없음'}`);
    return;
  }

  const now = Date.now();
  const parts = snap.windows.map((w) => {
    const pct = formatPercent(w.usedPercent);
    const reset = w.resetsAt !== null ? ` (${formatRemaining(w.resetsAt - now)} 후 리셋)` : '';
    const warn = (w.usedPercent ?? 0) >= 80 ? ' usage-warn' : '';
    return `<span class="usage-window${warn}">${escapeHtml(w.label)} <b>${escapeHtml(pct)}</b>${escapeHtml(reset)}</span>`;
  });

  // codex처럼 마지막 활동 시점 기준 데이터는 기준 시각을 함께 표시
  const staleNote = snap.stale
    ? `<span class="usage-stale" title="마지막 활동 시점 기준 데이터">${escapeHtml(formatRemaining(now - snap.updatedAt))} 전 기준</span>`
    : '';

  const el = document.getElementById('usage-status');
  if (el) {
    el.innerHTML = `<span class="usage-provider">${escapeHtml(providerLabel)}</span>${parts.join('<span class="usage-sep">·</span>')}${staleNote}`;
  }
}

function renderText(text: string): void {
  const el = document.getElementById('usage-status');
  if (el) el.innerHTML = `<span class="usage-provider">${escapeHtml(text)}</span>`;
}
