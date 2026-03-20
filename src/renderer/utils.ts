/**
 * 유틸리티 함수
 */

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 시스템에 설치된 폰트만 select에 남기기
 * Canvas 렌더링 비교 방식으로 폰트 존재 여부를 판별한다.
 */
export function filterAvailableFonts(selectEl: HTMLSelectElement): void {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const testStr = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const fallback = 'serif';
  const size = '48px';

  ctx.font = `${size} ${fallback}`;
  const fallbackWidth = ctx.measureText(testStr).width;

  const options = Array.from(selectEl.options);
  for (const opt of options) {
    const fontName = opt.value;
    ctx.font = `${size} "${fontName}", ${fallback}`;
    const testWidth = ctx.measureText(testStr).width;
    if (testWidth === fallbackWidth) {
      ctx.font = `${size} "${fontName}", monospace`;
      const monoWidth = ctx.measureText(testStr).width;
      ctx.font = `${size} monospace`;
      const defaultMonoWidth = ctx.measureText(testStr).width;
      if (monoWidth === defaultMonoWidth) {
        opt.disabled = true;
        opt.textContent = opt.textContent + ' (not installed)';
        opt.style.color = '#565f89';
      }
    }
  }
}
