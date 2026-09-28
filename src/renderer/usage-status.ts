/**
 * 하단 상태바 — AI 도구 사용량 표시
 *
 * 설정에서 체크한 제공자만 조회해 나란히 표시한다 (usageVisibleProviders).
 * 터미널에서 실제로 감지(실행 중)됐는지는 보지 않고 체크 여부만 본다 — 도구가
 * 사용량 한도로 막혀 프롬프트조차 못 띄우는 경우(예: Codex 한도 초과)에도 놓치지
 * 않기 위함이다.
 * 로그인/실행 기록이 없어 조회 실패한 제공자는 흐리게 표시하고 사유는 title 툴팁으로 노출한다.
 * ↻ 버튼으로 즉시 새로고침(force) 가능 — main 쪽에서 제공자별 최소 간격으로 보호된다.
 *
 * 상태바 자체는 항상 표시한다 (복사/붙여넣기 단축키 안내를 상시 노출해야 하므로).
 */
import { state, electronAPI } from './state';
import { fitAllTerminals } from './terminal';
import { formatRemaining, formatPercent } from '../shared/usage-format';
import { escapeHtml } from './utils';
import { t } from '../shared/i18n';
import type { UsageProviderId, UsageSnapshot } from '../shared/types';

// 메인 프로세스(usage-service.ts)가 만드는 고정 한국어 문자열 → i18n 키로 변환한다.
// main은 아직 한국어 텍스트를 그대로 내려주므로(IPC 계약을 건드리지 않기 위해),
// 알려진 패턴만 매칭해 번역하고 나머지(안티그래비티 모델명, 예상 못한 런타임 에러 등)는
// 그대로 통과시킨다.
const USAGE_TEXT_PATTERNS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^세션\((\d+)h\)$/, (m) => t('usage.window_session', { hours: m[1] })],
  [/^주간$/, () => t('usage.window_weekly')],
  [/^(\d+)일$/, (m) => t('usage.window_days', { days: m[1] })],
  [/^사용량 한도 초과$/, () => t('usage.limit_exceeded')],
  [/^사용량 응답 형식을 해석할 수 없습니다$/, () => t('usage.err.claude_parse')],
  [/^Claude Code 토큰 만료 — claude를 한 번 실행해 갱신하세요$/, () => t('usage.err.claude_token_expired')],
  [/^Claude Code 로그인 정보 없음 \(~\/\.claude\/\.credentials\.json\)$/, () => t('usage.err.claude_no_creds')],
  [/^사용량 API 오류 \(HTTP (\d+)\)$/, (m) => t('usage.err.claude_http', { status: m[1] })],
  [/^Codex 세션 기록 없음 \(~\/\.codex\/sessions\)$/, () => t('usage.err.codex_no_sessions')],
  [/^최근 세션에서 rate limit 정보를 찾지 못했습니다$/, () => t('usage.err.codex_no_rate_limit')],
  [/^Antigravity 로그인 정보 없음 — agy로 로그인하세요$/, () => t('usage.err.antigravity_no_login')],
  [/^인증 만료 — agy로 다시 로그인하세요$/, () => t('usage.err.antigravity_auth_expired')],
  [/^쿼터 API 오류 \(HTTP (.+)\)$/, (m) => t('usage.err.antigravity_http', { status: m[1] })],
  [/^쿼터 정보를 찾을 수 없습니다$/, () => t('usage.err.antigravity_no_quota')],
];

function translateUsageText(text: string): string {
  for (const [re, fn] of USAGE_TEXT_PATTERNS) {
    const m = text.match(re);
    if (m) return fn(m);
  }
  return text;
}

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
let lastSnapshots: UsageSnapshot[] = [];
let refreshing = false;

function visibleProviders(): UsageProviderId[] {
  return state.settings?.usageVisibleProviders ?? ['claude'];
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

/** 언어 변경 시 호출 — 네트워크 재조회 없이 캐시된 스냅샷을 새 언어로 다시 그린다 */
export function reapplyUsageLocale(): void {
  if (lastSnapshots.length > 0) renderSnapshots(lastSnapshots);
}

/** 설정 변경(표시 항목/주기) 시 호출 — 사용량 영역 토글 + 폴링 재시작 */
export function applyUsageVisibility(): void {
  const bar = document.getElementById('statusbar');
  const visible = visibleProviders().length > 0;

  // 상태바는 단축키 안내 때문에 항상 표시, 사용량 영역만 설정에 따라 토글
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
      if (lastSnapshots.length > 0) renderSnapshots(lastSnapshots);
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
  const providers = visibleProviders();
  if (providers.length === 0 || refreshing) return;

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
    renderText(t('usage.query_failed'));
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
    const reason = escapeHtml(snap.error ? translateUsageText(snap.error) : t('usage.not_connected'));
    return `<span class="usage-group usage-error" title="${reason}"><span class="usage-provider">${escapeHtml(providerLabel)}</span></span>`;
  }

  const parts = snap.windows.map((w) => {
    const pct = formatPercent(w.usedPercent);
    // resetsAt이 이미 지난 값이면(오래된 세션 기록 기반 stale 데이터) "곧 리셋"으로
    // 잘못 표시하지 않고 생략한다 — 실제 리셋 여부를 알 수 없는 상태이기 때문
    const reset = (w.resetsAt !== null && w.resetsAt > now)
      ? ` (${t('usage.reset_suffix', { time: formatRemaining(w.resetsAt - now) })})`
      : '';
    const warn = (w.usedPercent ?? 0) >= 80 ? ' usage-warn' : '';
    return `<span class="usage-window${warn}">${escapeHtml(translateUsageText(w.label))} <b>${escapeHtml(pct)}</b>${escapeHtml(reset)}</span>`;
  });

  // codex처럼 마지막 활동 시점 기준 데이터는 기준 시각을 함께 표시
  const staleNote = snap.stale
    ? `<span class="usage-stale" title="${escapeHtml(t('usage.stale_tooltip'))}">${escapeHtml(t('usage.stale_suffix', { time: formatRemaining(now - snap.updatedAt) }))}</span>`
    : '';

  return `<span class="usage-group"><span class="usage-provider">${escapeHtml(providerLabel)}</span>${parts.join('<span class="usage-sep">·</span>')}${staleNote}</span>`;
}

function renderText(text: string): void {
  const el = document.getElementById('usage-status');
  if (el) el.innerHTML = `<span class="usage-provider">${escapeHtml(text)}</span>`;
}
