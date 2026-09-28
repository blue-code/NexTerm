/**
 * 경량 국제화(i18n) 프레임워크
 * 외부 의존성 없이 t('key') 함수로 로컬라이징된 문자열을 반환한다.
 * 지원 언어: ko(한국어), en(영어), ja(일본어), zh(중국어 간체)
 */

type LocaleStrings = Record<string, string>;

const locales: Record<string, LocaleStrings> = {};
let currentLocale = 'ko';
const changeListeners: Array<() => void> = [];

/** 로케일 데이터 등록 */
export function registerLocale(locale: string, strings: LocaleStrings): void {
  locales[locale] = { ...locales[locale], ...strings };
}

/** 현재 로케일 설정 — 실제로 바뀐 경우에만 리스너(화면 재렌더용)를 호출한다 */
export function setLocale(locale: string): void {
  if (locales[locale] && locale !== currentLocale) {
    currentLocale = locale;
    changeListeners.forEach((cb) => cb());
  }
}

/** 로케일 변경 시 호출할 콜백 등록 (화면 전체 재렌더 트리거용). 메인 프로세스에서는 사용하지 않는다. */
export function onLocaleChange(cb: () => void): void {
  changeListeners.push(cb);
}

/** 현재 로케일 조회 */
export function getLocale(): string {
  return currentLocale;
}

/** 지원 로케일 목록 */
export function getSupportedLocales(): Array<{ code: string; name: string }> {
  return [
    { code: 'ko', name: '한국어' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' },
  ];
}

/**
 * 번역 문자열 반환 (키가 없으면 키 자체를 반환).
 * params를 넘기면 '{name}' 형태의 플레이스홀더를 치환한다.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let str = locales[currentLocale]?.[key] || locales['ko']?.[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}
