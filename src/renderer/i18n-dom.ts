/**
 * 정적 HTML(index.html)에 심어둔 data-i18n* 속성을 실제 번역 문자열로 채운다.
 * 동적으로 생성되는 innerHTML(사이드바, 패널 등)은 각 렌더 함수가 t()를 직접 호출한다.
 */
import { t } from '../shared/i18n';

export function applyI18n(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder!);
  });
}
