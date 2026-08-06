/**
 * 하단 상태바 — AI 도구 사용량 표시
 *
 * 설정(usageAutoDetectEnabled)이 켜져 있으면, 열린 터미널 패널에서 실제로 감지된
 * AI 도구(state.agentStatuses — agent-detect-service가 패턴 매칭한 결과)의 사용량만
 * 조회해 표시한다. 감지된 도구가 없으면 사용량 영역 자체를 숨긴다.
 * 패널의 에이전트 상태가 바뀔 때마다 agent-indicator.ts가 notifyAgentActivityChanged()를
 * 호출해 즉시 반영하고, 폴링 주기로도 최신 사용률을 갱신한다.
 * ↻ 버튼으로 즉시 새로고침(force) 가능 — main 쪽에서 제공자별 최소 간격으로 보호된다.
 *
 * 상태바 자체는 항상 표시한다 (복사/붙여넣기 단축키 안내를 상시 노출해야 하므로).
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

// agent-detect-service가 매기는 에이전트 이름 → 사용량 제공자 id
const AGENT_NAME_TO_PROVIDER: Record<string, UsageProviderId> = {
  'Claude Code': 'claude',
  'Codex': 'codex',
  'Antigravity': 'antigravity',
};

const DEFAULT_INTERVAL_SEC = 300;
const MIN_INTERVAL_SEC = 30;

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let repaintTimer: ReturnType<typeof setInterval> | null = null;
let lastSnapshots: UsageSnapshot[] = [];
let refreshing = false;

function autoDetectEnabled(): boolean {
  return state.settings?.usageAutoDetectEnabled ?? true;
}

/** 현재 어떤 패널에서든 active/completed로 감지 중인 도구의 제공자 id 목록 (중복 제거) */
function detectedProviders(): UsageProviderId[] {
  const set = new Set<UsageProviderId>();
  for (const info of state.agentStatuses.values()) {
    if (!info.name) continue;
    const provider = AGENT_NAME_TO_PROVIDER[info.name];
    if (provider) set.add(provider);
  }
  return [...set];
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
  applyUsageVisibility();
}

/** 설정 변경(자동 감지 on/off, 주기) 시 호출 — 사용량 영역 토글 + 폴링 재시작 */
export function applyUsageVisibility(): void {
  const bar = document.getElementById('statusbar');

  // 상태바는 단축키 안내 때문에 항상 표시
  document.body.classList.add('has-statusbar');
  bar?.classList.remove('hidden');

  stopPolling();
  if (!autoDetectEnabled()) {
    document.getElementById('usage-status')?.classList.add('hidden');
    document.getElementById('btn-usage-refresh')?.classList.add('hidden');
    fitAllTerminals();
    return;
  }

  syncVisibility();
  schedule();
  // 남은 시간 표시가 폴링 주기 사이에 낡지 않도록 1분마다 재계산해 다시 그린다
  repaintTimer = setInterval(() => {
    if (lastSnapshots.length > 0) renderSnapshots(lastSnapshots);
  }, 60_000);
}

/** 패널의 에이전트 감지 상태가 바뀔 때(agent-indicator.ts) 호출 — 즉시 반영 */
export function notifyAgentActivityChanged(): void {
  if (!autoDetectEnabled()) return;
  syncVisibility();
}

/** 현재 감지 상태에 맞춰 표시 영역을 켜고 사용량을 새로 조회한다 */
function syncVisibility(): void {
  const hasAny = detectedProviders().length > 0;
  document.getElementById('usage-status')?.classList.toggle('hidden', !hasAny);
  document.getElementById('btn-usage-refresh')?.classList.toggle('hidden', !hasAny);
  fitAllTerminals();

  if (hasAny) {
    void refreshUsage(false);
  } else {
    lastSnapshots = [];
    renderSnapshots([]);
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
  if (!autoDetectEnabled() || refreshing) return;
  const providers = detectedProviders();
  if (providers.length === 0) {
    lastSnapshots = [];
    renderSnapshots([]);
    return;
  }

  refreshing = true;
  const btn = document.getElementById('btn-usage-refresh');
  btn?.classList.add('spinning');
  try {
    const snapshots = await Promise.all(
      providers.map((provider) =>
        electronAPI.invoke('usage:get', { provider, force }) as Promise<UsageSnapshot>,
      ),
    );
    lastSnapshots = snapshots;
    renderSnapshots(snapshots);
  } catch {
    renderText('사용량 조회 실패');
  } finally {
    refreshing = false;
    btn?.classList.remove('spinning');
  }
}

function renderSnapshots(snapshots: UsageSnapshot[]): void {
  const now = Date.now();
  const el = document.getElementById('usage-status');
  if (!el) return;
  el.innerHTML = snapshots.map((snap) => renderGroup(snap, now)).join('<span class="usage-provider-sep">|</span>');
}

/** 제공자 1개의 상태바 조각 HTML — 조회 실패 시 흐리게 표시하고 사유는 title에 담는다 */
function renderGroup(snap: UsageSnapshot, now: number): string {
  const providerLabel = PROVIDER_LABELS[snap.provider] || snap.provider;

  if (!snap.ok) {
    const reason = escapeHtml(snap.error || '연결되지 않음');
    return `<span class="usage-group usage-error" title="${reason}"><span class="usage-provider">${escapeHtml(providerLabel)}</span></span>`;
  }

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

  return `<span class="usage-group"><span class="usage-provider">${escapeHtml(providerLabel)}</span>${parts.join('<span class="usage-sep">·</span>')}${staleNote}</span>`;
}

function renderText(text: string): void {
  const el = document.getElementById('usage-status');
  if (el) el.innerHTML = `<span class="usage-provider">${escapeHtml(text)}</span>`;
}
