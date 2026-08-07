/**
 * AI 도구 사용량 서비스 — 파서 단위 테스트
 *
 * 각 제공자의 원본 응답/로그를 UsageSnapshot으로 변환하는 순수 함수를 검증한다.
 * (네트워크/파일 IO는 UsageService 내부에서만 수행하고 여기서는 다루지 않는다)
 */
import { describe, it, expect } from 'vitest';
import {
  parseClaudeUsage,
  parseCodexSessionJsonl,
  parseAntigravityQuota,
  parseCodexLimitResetDate,
} from '../src/main/services/usage-service';
import { formatRemaining, formatPercent } from '../src/shared/usage-format';

const NOW = Date.parse('2026-07-14T03:00:00Z');

describe('parseClaudeUsage', () => {
  it('five_hour/seven_day 응답을 세션/주간 윈도우로 변환한다', () => {
    const snap = parseClaudeUsage({
      five_hour: { utilization: 42, resets_at: '2026-07-14T05:00:00Z' },
      seven_day: { utilization: 7.5, resets_at: '2026-07-18T00:00:00Z' },
    }, NOW);

    expect(snap.ok).toBe(true);
    expect(snap.provider).toBe('claude');
    expect(snap.windows).toHaveLength(2);
    expect(snap.windows[0]).toEqual({
      label: '세션(5h)',
      usedPercent: 42,
      resetsAt: Date.parse('2026-07-14T05:00:00Z'),
    });
    expect(snap.windows[1].label).toBe('주간');
    expect(snap.windows[1].usedPercent).toBe(7.5);
  });

  it('필드가 없으면 ok=false를 반환한다', () => {
    const snap = parseClaudeUsage({ unexpected: true }, NOW);
    expect(snap.ok).toBe(false);
    expect(snap.error).toBeTruthy();
  });

  it('한쪽 윈도우만 있어도 동작한다', () => {
    const snap = parseClaudeUsage({
      five_hour: { utilization: 10, resets_at: '2026-07-14T04:00:00Z' },
    }, NOW);
    expect(snap.ok).toBe(true);
    expect(snap.windows).toHaveLength(1);
  });
});

describe('parseCodexSessionJsonl', () => {
  const line = (ts: string, rl: unknown) => JSON.stringify({
    timestamp: ts,
    type: 'event_msg',
    payload: { type: 'token_count', info: {}, rate_limits: rl },
  });

  it('마지막 rate_limits 이벤트에서 5시간/주간 윈도우를 읽는다 (resets_at epoch초)', () => {
    const content = [
      line('2026-07-14T01:00:00Z', {
        primary: { used_percent: 3, window_minutes: 300, resets_at: 1783402045 },
        secondary: { used_percent: 1, window_minutes: 10080, resets_at: 1783996822 },
      }),
      line('2026-07-14T02:00:00Z', {
        primary: { used_percent: 6, window_minutes: 300, resets_at: 1783402045 },
        secondary: { used_percent: 2, window_minutes: 10080, resets_at: 1783996822 },
      }),
    ].join('\n');

    const snap = parseCodexSessionJsonl(content, NOW);
    expect(snap).not.toBeNull();
    expect(snap!.ok).toBe(true);
    expect(snap!.provider).toBe('codex');
    expect(snap!.windows[0]).toEqual({
      label: '세션(5h)',
      usedPercent: 6,
      resetsAt: 1783402045 * 1000,
    });
    expect(snap!.windows[1]).toEqual({
      label: '주간',
      usedPercent: 2,
      resetsAt: 1783996822 * 1000,
    });
    // 마지막 활동 시점 기준 데이터임을 표시
    expect(snap!.stale).toBe(true);
    expect(snap!.updatedAt).toBe(Date.parse('2026-07-14T02:00:00Z'));
  });

  it('구버전 resets_in_seconds 형식도 이벤트 시각 기준으로 환산한다', () => {
    const content = line('2026-07-14T02:00:00Z', {
      primary: { used_percent: 50, window_minutes: 300, resets_in_seconds: 3600 },
    });
    const snap = parseCodexSessionJsonl(content, NOW);
    expect(snap!.windows[0].resetsAt).toBe(Date.parse('2026-07-14T02:00:00Z') + 3600 * 1000);
  });

  it('rate_limits가 null이거나 없으면 null을 반환한다', () => {
    const content = [
      line('2026-07-14T01:00:00Z', null),
      JSON.stringify({ timestamp: '2026-07-14T01:01:00Z', type: 'other' }),
      '깨진 JSON 라인',
    ].join('\n');
    expect(parseCodexSessionJsonl(content, NOW)).toBeNull();
  });

  it('usage_limit_exceeded 에러는 rate_limits(primary/secondary=null)보다 우선해 100%로 표시한다', () => {
    // 실제 관측된 형태: 한도 초과 시 rate_limits는 남지만 primary/secondary가 둘 다 null이라
    // 그대로 두면 이 값이 무시되고 더 오래된 파일의 stale 수치로 폴백해버린다.
    const content = [
      line('2026-08-07T01:00:00Z', {
        primary: { used_percent: 11, window_minutes: 10080, resets_at: 1785261615 },
      }),
      JSON.stringify({
        timestamp: '2026-08-07T01:09:19.518Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: null,
          rate_limits: { primary: null, secondary: null },
        },
      }),
      JSON.stringify({
        timestamp: '2026-08-07T01:09:19.542Z',
        type: 'event_msg',
        payload: {
          type: 'task_complete',
          error: {
            message: "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Aug 8th, 2026 11:07 PM.",
            codex_error_info: 'usage_limit_exceeded',
          },
        },
      }),
    ].join('\n');

    const snap = parseCodexSessionJsonl(content, NOW);
    expect(snap).not.toBeNull();
    expect(snap!.windows).toEqual([{
      label: '사용량 한도 초과',
      usedPercent: 100,
      resetsAt: Date.parse('2026-08-08T23:07:00'),
    }]);
    expect(snap!.updatedAt).toBe(Date.parse('2026-08-07T01:09:19.542Z'));
  });
});

describe('parseCodexLimitResetDate', () => {
  it('"try again at ... ." 꼬리에서 서수 접미사를 제거하고 날짜를 파싱한다', () => {
    const ms = parseCodexLimitResetDate(
      "You've hit your usage limit. Upgrade to Pro, try again at Aug 8th, 2026 11:07 PM.",
    );
    expect(ms).toBe(Date.parse('2026-08-08T23:07:00'));
  });

  it('꼬리 패턴이 없으면 null', () => {
    expect(parseCodexLimitResetDate('알 수 없는 오류입니다.')).toBeNull();
  });
});

describe('parseAntigravityQuota', () => {
  // 2026 최신 retrieveUserQuotaSummary 응답 구조 (groups[].buckets[])
  it('groups/buckets의 remainingFraction을 사용률 윈도우로 변환한다', () => {
    const snap = parseAntigravityQuota({
      groups: [
        {
          buckets: [
            { bucketId: 'gemini-3.1-pro-high', displayName: 'Gemini 3.1 Pro (High)', remainingFraction: 0.2, resetTime: '2026-07-21T02:15:05Z' },
            { bucketId: 'gemini-3.5-flash-low', displayName: 'Gemini 3.5 Flash (Medium)', remainingFraction: 0.8, resetTime: '2026-07-21T02:15:05Z' },
          ],
        },
      ],
    }, NOW);

    expect(snap.ok).toBe(true);
    expect(snap.provider).toBe('antigravity');
    // 사용률 높은 순으로 정렬 (Pro High가 80% 사용)
    expect(snap.windows[0].label).toBe('Gemini 3.1 Pro (High)');
    expect(snap.windows[0].usedPercent).toBeCloseTo(80);
    expect(snap.windows[1].usedPercent).toBeCloseTo(20);
    expect(snap.windows[0].resetsAt).toBe(Date.parse('2026-07-21T02:15:05Z'));
  });

  it('remainingFraction 없는 버킷과 내부 버킷(tab_/image)은 제외한다', () => {
    const snap = parseAntigravityQuota({
      groups: [
        {
          buckets: [
            { bucketId: 'tab_flash_lite_preview', displayName: 'Tab', remainingFraction: 0.1 },
            { bucketId: 'gemini-3-pro-image', displayName: 'Image', remainingFraction: 0.1, resetTime: '2026-07-21T02:15:05Z' },
            { bucketId: 'gemini-3.1-pro-low', displayName: 'Gemini 3.1 Pro (Low)' }, // remainingFraction 없음
            { bucketId: 'gemini-3.5-flash-high', displayName: 'Gemini 3.5 Flash (High)', remainingFraction: 0.5, resetTime: '2026-07-21T02:15:05Z' },
          ],
        },
      ],
    }, NOW);
    expect(snap.ok).toBe(true);
    expect(snap.windows).toHaveLength(1);
    expect(snap.windows[0].label).toBe('Gemini 3.5 Flash (High)');
  });

  it('구버전 fetchAvailableModels(models{}) 응답도 계속 해석한다', () => {
    const snap = parseAntigravityQuota({
      models: {
        'gemini-3-flash': {
          displayName: 'Gemini 3 Flash',
          quotaInfo: { remainingFraction: 0.25, resetTime: '2026-07-14T08:00:00Z' },
        },
      },
    }, NOW);
    expect(snap.ok).toBe(true);
    expect(snap.windows[0].label).toBe('Gemini 3 Flash');
    expect(snap.windows[0].usedPercent).toBeCloseTo(75);
  });

  it('버킷/모델이 하나도 없으면 ok=false', () => {
    expect(parseAntigravityQuota({ groups: [] }, NOW).ok).toBe(false);
    expect(parseAntigravityQuota({ models: {} }, NOW).ok).toBe(false);
  });
});

describe('usage-format', () => {
  it('formatRemaining — 분/시간/일 단위로 요약한다', () => {
    expect(formatRemaining(30 * 1000)).toBe('곧');
    expect(formatRemaining(5 * 60 * 1000)).toBe('5분');
    expect(formatRemaining((2 * 60 + 10) * 60 * 1000)).toBe('2시간 10분');
    expect(formatRemaining((3 * 24 + 4) * 60 * 60 * 1000)).toBe('3일 4시간');
    expect(formatRemaining(-1000)).toBe('곧');
  });

  it('formatPercent — 소수점 한 자리까지, 정수는 정수로', () => {
    expect(formatPercent(42)).toBe('42%');
    expect(formatPercent(7.5)).toBe('7.5%');
    expect(formatPercent(7.46)).toBe('7.5%');
    expect(formatPercent(null)).toBe('-');
  });
});
