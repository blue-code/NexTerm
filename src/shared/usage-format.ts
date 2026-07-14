/**
 * AI 도구 사용량 표시용 포맷 헬퍼 (순수 함수)
 * 렌더러 상태바와 테스트에서 공용으로 사용한다.
 */

/** 남은 시간(ms)을 '2시간 10분' 형태로 요약. 1분 미만/음수는 '곧'. */
export function formatRemaining(ms: number): string {
  if (ms < 60 * 1000) return '곧';
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  return `${minutes}분`;
}

/** 사용률(%)을 표시 문자열로 — 정수는 정수로, 소수는 한 자리까지 */
export function formatPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return '-';
  const rounded = Math.round(percent * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
