/**
 * AI 도구 사용량 조회 서비스 (하단 상태바용)
 *
 * 제공자별 데이터 소스:
 *  - claude      : ~/.claude/.credentials.json의 OAuth 토큰으로
 *                  https://api.anthropic.com/api/oauth/usage 조회.
 *                  5시간 세션/주간 사용률(%)과 리셋 시각을 반환하는 공식 엔드포인트.
 *                  User-Agent가 없으면 공격적으로 429가 나므로 반드시 지정하고,
 *                  180초 미만 간격 재조회는 캐시로 차단한다.
 *  - codex       : ~/.codex/sessions/ 하위 rollout-*.jsonl의 token_count 이벤트에 실려오는
 *                  rate_limits(primary=5h, secondary=주간)를 최신 파일부터 역방향 스캔.
 *                  네트워크 불필요. 단, "마지막 Codex 활동 시점" 기준 데이터라 stale 표시.
 *  - antigravity : ~/.gemini/oauth_creds.json의 Google OAuth 토큰으로 cloudcode 내부
 *                  fetchAvailableModels를 호출해 모델별 잔여 쿼터/리셋 시각을 읽는다.
 *                  만료 시 refresh_token으로 갱신하되 파일에는 되쓰지 않는다(원본 보존).
 *
 * 파서(parse*)는 순수 함수로 분리해 단위 테스트한다. IO는 UsageService에만 둔다.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import type { UsageProviderId, UsageSnapshot, UsageWindow } from '../../shared/types';

// ── 공통 헬퍼 ──

function errorSnapshot(provider: UsageProviderId, message: string, now: number): UsageSnapshot {
  return { provider, ok: false, error: message, windows: [], updatedAt: now };
}

function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // epoch 초/밀리초 모두 수용 (10^12 미만이면 초로 간주)
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** window_minutes를 사람이 읽는 라벨로 (300=5시간 세션, 10080=주간) */
function windowLabel(windowMinutes: unknown, fallback: string): string {
  if (typeof windowMinutes === 'number') {
    if (windowMinutes <= 60 * 24) return `세션(${Math.round(windowMinutes / 60)}h)`;
    if (windowMinutes >= 60 * 24 * 6 && windowMinutes <= 60 * 24 * 8) return '주간';
    return `${Math.round(windowMinutes / 60 / 24)}일`;
  }
  return fallback;
}

// ── Claude Code ──

interface ClaudeUsageWindowRaw {
  utilization?: unknown;
  resets_at?: unknown;
}

/** OAuth usage 응답 → 스냅샷. { five_hour: {utilization, resets_at}, seven_day: {...} } */
export function parseClaudeUsage(json: unknown, now: number): UsageSnapshot {
  const obj = (json ?? {}) as Record<string, ClaudeUsageWindowRaw>;
  const windows: UsageWindow[] = [];

  const pick = (raw: ClaudeUsageWindowRaw | undefined, label: string): void => {
    if (!raw || typeof raw.utilization !== 'number') return;
    windows.push({
      label,
      usedPercent: raw.utilization,
      resetsAt: toEpochMs(raw.resets_at),
    });
  };
  pick(obj.five_hour, '세션(5h)');
  pick(obj.seven_day, '주간');

  if (windows.length === 0) {
    return errorSnapshot('claude', '사용량 응답 형식을 해석할 수 없습니다', now);
  }
  return { provider: 'claude', ok: true, windows, updatedAt: now };
}

// ── Codex ──

interface CodexRateWindowRaw {
  used_percent?: unknown;
  window_minutes?: unknown;
  resets_at?: unknown;
  resets_in_seconds?: unknown;
}

function codexWindow(raw: CodexRateWindowRaw | undefined, eventMs: number, fallbackLabel: string): UsageWindow | null {
  if (!raw || typeof raw.used_percent !== 'number') return null;
  let resetsAt = toEpochMs(raw.resets_at);
  // 구버전 형식: 이벤트 시각 기준 상대 초
  if (resetsAt === null && typeof raw.resets_in_seconds === 'number') {
    resetsAt = eventMs + raw.resets_in_seconds * 1000;
  }
  return { label: windowLabel(raw.window_minutes, fallbackLabel), usedPercent: raw.used_percent, resetsAt };
}

/**
 * task_complete 에러 메시지의 "try again at Aug 8th, 2026 11:07 PM." 꼬리에서 리셋 시각을 추출.
 * 서수 접미사(1st/2nd/3rd/4th 등)는 Date.parse가 못 읽으므로 제거 후 파싱한다.
 * 파싱 실패 시 null (호출자는 리셋 시각 없이 표시).
 */
export function parseCodexLimitResetDate(message: string): number | null {
  const m = message.match(/try again at ([^.]+)\.?\s*$/i);
  if (!m) return null;
  const cleaned = m[1].replace(/(\d+)(st|nd|rd|th)\b/i, '$1');
  const t = Date.parse(cleaned);
  return Number.isNaN(t) ? null : t;
}

/**
 * 세션 rollout JSONL 내용에서 가장 마지막(최신) 사용량 신호를 찾아 스냅샷 생성.
 * 두 가지 신호를 함께 본다 (뒤에서부터 스캔하며 먼저 만나는 쪽이 최신 상태이므로 그것을 채택):
 *  - "usage_limit_exceeded" 에러: 계정이 한도 초과로 완전히 막힌 상태. rate_limits의
 *    남은 퍼센트보다 우선한다 — 이 이벤트가 있는 파일은 대개 rate_limits.primary/secondary가
 *    둘 다 null이라(요청 자체가 거부됨) 방치하면 더 오래된 파일의 stale 수치로 폴백해버린다.
 *  - rate_limits: 평소의 세션(5h)/주간 사용률.
 * 둘 다 없으면 null (호출자가 다음 파일을 계속 탐색).
 */
export function parseCodexSessionJsonl(content: string, now: number): UsageSnapshot | null {
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.includes('rate_limits') && !line.includes('usage_limit_exceeded')) continue;
    try {
      const record = JSON.parse(line) as {
        timestamp?: unknown;
        payload?: {
          rate_limits?: { primary?: CodexRateWindowRaw; secondary?: CodexRateWindowRaw } | null;
          error?: { message?: unknown; codex_error_info?: unknown } | null;
        };
        rate_limits?: { primary?: CodexRateWindowRaw; secondary?: CodexRateWindowRaw } | null;
      };
      const eventMs = toEpochMs(record.timestamp) ?? now;

      const err = record.payload?.error;
      if (err && err.codex_error_info === 'usage_limit_exceeded') {
        const resetsAt = typeof err.message === 'string' ? parseCodexLimitResetDate(err.message) : null;
        // 파싱된 리셋 시각이 이미 지났다면(며칠~몇 주 전 발생한 오래된 차단 기록) 지금도
        // 막혀 있다고 단정하지 않는다 — 그사이 리셋됐을 가능성이 높으므로 이 신호는 건너뛰고
        // (계속 스캔) 더 오래된 rate_limits가 있으면 그걸로 폴백한다.
        if (resetsAt === null || resetsAt > now) {
          return {
            provider: 'codex',
            ok: true,
            windows: [{ label: '사용량 한도 초과', usedPercent: 100, resetsAt }],
            updatedAt: eventMs,
            stale: true,
          };
        }
      }

      const rl = record.payload?.rate_limits ?? record.rate_limits;
      if (!rl) continue;
      const windows: UsageWindow[] = [];
      const primary = codexWindow(rl.primary, eventMs, '세션(5h)');
      const secondary = codexWindow(rl.secondary, eventMs, '주간');
      if (primary) windows.push(primary);
      if (secondary) windows.push(secondary);
      if (windows.length === 0) continue;

      return { provider: 'codex', ok: true, windows, updatedAt: eventMs, stale: true };
    } catch {
      // 깨진 라인은 건너뜀
    }
  }
  return null;
}

// ── Antigravity ──

interface AntigravityBucketRaw {
  bucketId?: unknown;
  displayName?: unknown;
  remainingFraction?: unknown;
  resetTime?: unknown;
}
interface AntigravityModelRaw {
  displayName?: unknown;
  quotaInfo?: { remainingFraction?: unknown; resetTime?: unknown };
}

// 상태바에 의미 없는 내부/이미지/자동완성(tab) 버킷 제외 패턴
const ANTIGRAVITY_NOISE = /image|rev\d|chat_|tab_|_lite_|placeholder/i;

function antigravityWindow(label: string, key: string, remainingFraction: unknown, resetTime: unknown): UsageWindow | null {
  if (typeof remainingFraction !== 'number') return null;
  if (ANTIGRAVITY_NOISE.test(key) || ANTIGRAVITY_NOISE.test(label)) return null;
  return {
    label: label || key,
    usedPercent: Math.min(100, Math.max(0, (1 - remainingFraction) * 100)),
    resetsAt: toEpochMs(resetTime),
  };
}

/**
 * Antigravity 쿼터 응답 → 사용률 윈도우 (사용률 높은 순 상위 3개).
 * 두 응답 형식을 모두 지원한다:
 *  - 최신 retrieveUserQuotaSummary : { groups: [{ buckets: [{ bucketId, displayName, remainingFraction, resetTime }] }] }
 *  - 구버전 fetchAvailableModels    : { models: { <id>: { displayName, quotaInfo: { remainingFraction, resetTime } } } }
 */
export function parseAntigravityQuota(json: unknown, now: number): UsageSnapshot {
  const root = (json ?? {}) as {
    groups?: Array<{ buckets?: AntigravityBucketRaw[] }>;
    models?: Record<string, AntigravityModelRaw>;
  };
  const windows: UsageWindow[] = [];

  // 최신 형식: groups[].buckets[]
  if (Array.isArray(root.groups)) {
    for (const group of root.groups) {
      for (const bucket of group?.buckets ?? []) {
        const key = typeof bucket.bucketId === 'string' ? bucket.bucketId : '';
        const label = typeof bucket.displayName === 'string' ? bucket.displayName : key;
        const w = antigravityWindow(label, key, bucket.remainingFraction, bucket.resetTime);
        if (w) windows.push(w);
      }
    }
  }

  // 구버전 형식: models{}
  if (windows.length === 0 && root.models && typeof root.models === 'object') {
    for (const [key, info] of Object.entries(root.models)) {
      const label = typeof info.displayName === 'string' ? info.displayName : key;
      const w = antigravityWindow(label, key, info.quotaInfo?.remainingFraction, info.quotaInfo?.resetTime);
      if (w) windows.push(w);
    }
  }

  if (windows.length === 0) {
    return errorSnapshot('antigravity', '쿼터 정보를 찾을 수 없습니다', now);
  }
  windows.sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0));
  return { provider: 'antigravity', ok: true, windows: windows.slice(0, 3), updatedAt: now };
}

// ── IO + 캐시 ──

const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Antigravity(agy CLI)가 실제로 사용하는 daily 엔드포인트. prod는 폴백.
// 최신 방식은 retrieveUserQuotaSummary(그룹/버킷 구조), 구버전은 fetchAvailableModels.
const CLOUDCODE_BASES = [
  'https://daily-cloudcode-pa.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
];
const CLOUDCODE_QUOTA_METHODS = ['retrieveUserQuotaSummary', 'fetchAvailableModels'];
// Antigravity 자격증명이 저장되는 Windows 자격 증명 관리자 대상(target) 이름
const ANTIGRAVITY_CRED_TARGET = 'gemini:antigravity';
// Antigravity 쿼터 엔드포인트는 Antigravity 클라이언트로 발급된 토큰만 허용한다
// (gemini-cli 토큰은 403/PERMISSION_DENIED). client_id는 공개 식별자.
// client_secret은 저장소/배포물에 하드코딩하지 않고, 설치된 agy 바이너리에서 런타임에 추출한다.
const ANTIGRAVITY_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
// agy 실행 파일 후보 경로 — 여기서 OAuth client secret을 추출한다
const AGY_BINARY_CANDIDATES = [
  path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'agy', 'agy.exe'),
];
// Google OAuth client secret은 'GOCSPX-' + 28자 고정 — 바이너리에서 두 시크릿이
// 인접 배치돼도 경계가 섞이지 않도록 정확한 길이로 매칭한다.
const GOCSPX_PATTERN = /GOCSPX-[A-Za-z0-9_-]{28}/g;

// 제공자별 최소 재조회 간격 (ms) — 외부 API 레이트리밋 보호
const MIN_INTERVAL: Record<UsageProviderId, number> = {
  none: 0,
  claude: 180_000,     // User-Agent 지정 시 180초 간격이 안전 권장치
  codex: 30_000,       // 로컬 파일 스캔이라 저렴
  antigravity: 300_000,
};

// 수동 새로고침(force)이라도 이 간격보다 짧게는 재조회하지 않는다
const FORCE_FLOOR_MS = 30_000;

interface CacheEntry {
  snapshot: UsageSnapshot;
  fetchedAt: number;
}

export class UsageService {
  private cache = new Map<UsageProviderId, CacheEntry>();
  private inFlight = new Map<UsageProviderId, Promise<UsageSnapshot>>();
  // Antigravity 토큰 갱신 결과는 메모리에만 보관 (원본 자격증명 보존)
  private antigravityToken: { accessToken: string; expiresAt: number } | null = null;
  // agy 바이너리에서 추출한 client secret 후보 (1회 추출 후 캐시). null=아직 안 읽음
  private antigravitySecrets: string[] | null = null;

  constructor(private readonly homeDir: string = os.homedir()) {}

  async getUsage(provider: UsageProviderId, force = false): Promise<UsageSnapshot> {
    const now = Date.now();
    if (provider === 'none') {
      return { provider, ok: false, error: '', windows: [], updatedAt: now };
    }

    const cached = this.cache.get(provider);
    const minInterval = force ? Math.min(FORCE_FLOOR_MS, MIN_INTERVAL[provider]) : MIN_INTERVAL[provider];
    if (cached && now - cached.fetchedAt < minInterval) {
      return cached.snapshot;
    }
    // 동시 호출 병합
    const pending = this.inFlight.get(provider);
    if (pending) return pending;

    const task = this.fetchFresh(provider, now)
      .catch((err: unknown) => errorSnapshot(provider, err instanceof Error ? err.message : String(err), now))
      .then((snapshot) => {
        this.cache.set(provider, { snapshot, fetchedAt: Date.now() });
        this.inFlight.delete(provider);
        return snapshot;
      });
    this.inFlight.set(provider, task);
    return task;
  }

  private fetchFresh(provider: UsageProviderId, now: number): Promise<UsageSnapshot> {
    switch (provider) {
      case 'claude': return this.fetchClaude(now);
      case 'codex': return Promise.resolve(this.fetchCodex(now));
      case 'antigravity': return this.fetchAntigravity(now);
      default: return Promise.resolve(errorSnapshot(provider, '지원하지 않는 제공자', now));
    }
  }

  // ── Claude Code ──

  private async fetchClaude(now: number): Promise<UsageSnapshot> {
    const credPath = path.join(this.homeDir, '.claude', '.credentials.json');
    let accessToken: string;
    try {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf8')) as {
        claudeAiOauth?: { accessToken?: string; expiresAt?: number };
      };
      accessToken = creds.claudeAiOauth?.accessToken ?? '';
      if (!accessToken) throw new Error('토큰 없음');
      const expiresAt = creds.claudeAiOauth?.expiresAt;
      if (typeof expiresAt === 'number' && expiresAt < now) {
        return errorSnapshot('claude', 'Claude Code 토큰 만료 — claude를 한 번 실행해 갱신하세요', now);
      }
    } catch {
      return errorSnapshot('claude', 'Claude Code 로그인 정보 없음 (~/.claude/.credentials.json)', now);
    }

    const res = await fetch(CLAUDE_USAGE_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        // User-Agent 미지정 시 공격적 레이트리밋 버킷에 걸려 지속 429 발생
        'User-Agent': 'claude-code/2.0.0 (external, cli)',
      },
    });
    if (!res.ok) {
      return errorSnapshot('claude', `사용량 API 오류 (HTTP ${res.status})`, now);
    }
    return parseClaudeUsage(await res.json(), now);
  }

  // ── Codex ──

  private fetchCodex(now: number): UsageSnapshot {
    const sessionsDir = path.join(this.homeDir, '.codex', 'sessions');
    let files: Array<{ file: string; mtime: number }>;
    try {
      files = collectJsonlFiles(sessionsDir)
        .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 12); // 최근 파일만 — 오래된 세션까지 뒤질 필요 없음
    } catch {
      return errorSnapshot('codex', 'Codex 세션 기록 없음 (~/.codex/sessions)', now);
    }

    for (const { file } of files) {
      try {
        const snap = parseCodexSessionJsonl(fs.readFileSync(file, 'utf8'), now);
        if (snap) return snap;
      } catch {
        // 읽기 실패한 파일은 건너뜀
      }
    }
    return errorSnapshot('codex', '최근 세션에서 rate limit 정보를 찾지 못했습니다', now);
  }

  // ── Antigravity ──

  private async fetchAntigravity(now: number): Promise<UsageSnapshot> {
    const accessToken = await this.getAntigravityToken(now);
    if (!accessToken) {
      return errorSnapshot('antigravity', 'Antigravity 로그인 정보 없음 — agy로 로그인하세요', now);
    }

    // daily → prod 순으로, 최신(retrieveUserQuotaSummary) → 구버전(fetchAvailableModels) 순으로 시도
    let lastStatus = 0;
    for (const base of CLOUDCODE_BASES) {
      for (const method of CLOUDCODE_QUOTA_METHODS) {
        const res = await fetch(`${base}/v1internal:${method}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'antigravity',
          },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const snap = parseAntigravityQuota(await res.json(), now);
          if (snap.ok) return snap;
          continue; // 형식은 응답했으나 버킷이 비면 다음 방식 시도
        }
        lastStatus = res.status;
        if (res.status === 401) {
          this.antigravityToken = null; // 토큰 폐기 후 다음 조합에서 재발급
          const retry = await this.getAntigravityToken(now);
          if (!retry) return errorSnapshot('antigravity', '인증 만료 — agy로 다시 로그인하세요', now);
        }
      }
    }
    return errorSnapshot('antigravity', `쿼터 API 오류 (HTTP ${lastStatus || '응답 없음'})`, now);
  }

  /**
   * Antigravity access token 확보. 갱신 결과는 메모리에만 보관한다(원본 자격증명 보존).
   * 인증 소스 우선순위:
   *  1) Windows 자격 증명 관리자 'gemini:antigravity' — agy가 저장한 토큰.
   *     쿼터 API가 요구하는 Antigravity 클라이언트 발급 토큰이라 유일하게 권한이 있다.
   *  2) opencode-antigravity-auth의 antigravity-accounts.json (refreshToken)
   */
  private async getAntigravityToken(now: number): Promise<string | null> {
    if (this.antigravityToken && this.antigravityToken.expiresAt > now + 60_000) {
      return this.antigravityToken.accessToken;
    }

    // 1) Windows 자격 증명 관리자 (agy 저장 토큰)
    const cred = this.readAntigravityCredential();
    if (cred) {
      // access_token이 아직 유효하면 그대로 사용
      const expMs = cred.expiry ? Date.parse(cred.expiry) : NaN;
      if (cred.access_token && Number.isFinite(expMs) && expMs > now + 60_000) {
        this.antigravityToken = { accessToken: cred.access_token, expiresAt: expMs };
        return cred.access_token;
      }
      if (cred.refresh_token) {
        const token = await this.refreshAntigravityToken(cred.refresh_token, now);
        if (token) {
          this.antigravityToken = token;
          return token.accessToken;
        }
      }
      if (cred.access_token) return cred.access_token; // 만료 판단 불가 시 일단 시도
    }

    // 2) opencode-antigravity-auth 계정 파일 폴백
    const accountsCandidates = [
      path.join(process.env.APPDATA || path.join(this.homeDir, 'AppData', 'Roaming'), 'opencode', 'antigravity-accounts.json'),
      path.join(this.homeDir, '.config', 'opencode', 'antigravity-accounts.json'),
    ];
    for (const file of accountsCandidates) {
      try {
        const store = JSON.parse(fs.readFileSync(file, 'utf8')) as {
          accounts?: Array<{ refreshToken?: string; enabled?: boolean }>;
          activeIndex?: number;
        };
        const accounts = (store.accounts ?? []).filter((a) => a.refreshToken && a.enabled !== false);
        const account = accounts[store.activeIndex ?? 0] ?? accounts[0];
        if (account?.refreshToken) {
          const token = await this.refreshAntigravityToken(account.refreshToken, now);
          if (token) {
            this.antigravityToken = token;
            return token.accessToken;
          }
        }
      } catch {
        // 다음 후보
      }
    }
    return null;
  }

  /**
   * Windows 자격 증명 관리자에서 agy의 Antigravity 자격증명을 읽는다.
   * 블롭은 DPAPI로 암호화돼 있고 동일 사용자만 복호화 가능 — NexTerm이 같은 사용자로
   * 실행되므로 접근 가능하다. PowerShell CredRead로 UTF-8 JSON 문자열을 받아 파싱한다.
   * 형식: { token: { access_token, refresh_token, expiry, token_type }, auth_method }
   * Windows 외 플랫폼에서는 null.
   */
  private readAntigravityCredential(): { access_token?: string; refresh_token?: string; expiry?: string } | null {
    if (process.platform !== 'win32') return null;
    const script = `
$sig = @'
using System;
using System.Runtime.InteropServices;
public class NxCred {
  [StructLayout(LayoutKind.Sequential)]
  public struct CREDENTIAL { public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist; public uint AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr cred);
}
'@
Add-Type -TypeDefinition $sig
$ptr = [IntPtr]::Zero
if ([NxCred]::CredRead('${ANTIGRAVITY_CRED_TARGET}', 1, 0, [ref]$ptr)) {
  $c = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][NxCred+CREDENTIAL])
  $bytes = New-Object byte[] $c.CredentialBlobSize
  [System.Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $c.CredentialBlobSize)
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::Write([System.Text.Encoding]::UTF8.GetString($bytes))
}`;
    try {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
      }).replace(/^﻿/, '').trim();
      if (!out) return null;
      const parsed = JSON.parse(out) as { token?: Record<string, string> } & Record<string, string>;
      return parsed.token ?? parsed;
    } catch {
      return null;
    }
  }

  /**
   * Antigravity refresh_token으로 access token 갱신.
   * client secret은 저장소에 두지 않고 agy 바이너리에서 추출한 후보들을 순서대로 시도한다.
   * (Google이 시크릿을 교체해도 재빌드 없이 따라간다)
   */
  private async refreshAntigravityToken(refreshToken: string, now: number): Promise<{ accessToken: string; expiresAt: number } | null> {
    for (const secret of this.getAntigravitySecrets()) {
      const token = await this.refreshGoogleToken(refreshToken, ANTIGRAVITY_CLIENT_ID, secret, now);
      if (token) return token;
    }
    return null;
  }

  /** agy 바이너리에서 OAuth client secret 후보를 추출 (1회 후 캐시) */
  private getAntigravitySecrets(): string[] {
    if (this.antigravitySecrets) return this.antigravitySecrets;
    const secrets = new Set<string>();
    for (const bin of AGY_BINARY_CANDIDATES) {
      if (!bin) continue;
      try {
        const content = fs.readFileSync(bin, 'latin1');
        for (const m of content.matchAll(GOCSPX_PATTERN)) secrets.add(m[0]);
        if (secrets.size > 0) break;
      } catch {
        // 다음 후보
      }
    }
    this.antigravitySecrets = [...secrets];
    return this.antigravitySecrets;
  }

  private async refreshGoogleToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
    now: number,
  ): Promise<{ accessToken: string; expiresAt: number } | null> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    return { accessToken: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
  }
}

/** 디렉터리 트리에서 .jsonl 파일 목록 수집 (오류는 빈 배열) */
function collectJsonlFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      try { out.push(...collectJsonlFiles(full)); } catch { /* 접근 불가 폴더 무시 */ }
    } else if (entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
  return out;
}
