/**
 * Omnibar — Chrome 스타일 주소/검색 통합 입력
 * 히스토리 기반 자동완성, 검색엔진 통합, 키보드 네비게이션 지원
 */
import { electronAPI } from './state';
import { escapeHtml } from './utils';
import type { BrowserHistoryEntry } from '../../shared/types';

// 검색엔진 URL 템플릿 ({q}를 검색어로 치환)
const SEARCH_ENGINE = 'https://www.google.com/search?q={q}';

interface OmnibarContext {
  input: HTMLInputElement;
  dropdown: HTMLDivElement;
  selectedIndex: number;
  results: BrowserHistoryEntry[];
  onNavigate: (url: string) => void;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

/** Omnibar를 생성하고 이벤트를 바인딩한다 */
export function createOmnibar(
  container: HTMLElement,
  initialUrl: string,
  onNavigate: (url: string) => void,
): { input: HTMLInputElement; updateUrl: (url: string) => void } {
  const wrapper = document.createElement('div');
  wrapper.className = 'omnibar-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'omnibar-input';
  input.value = initialUrl;
  input.placeholder = 'URL 또는 검색어 입력...';
  input.spellcheck = false;

  const dropdown = document.createElement('div');
  dropdown.className = 'omnibar-dropdown hidden';

  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);
  container.appendChild(wrapper);

  const ctx: OmnibarContext = {
    input,
    dropdown,
    selectedIndex: -1,
    results: [],
    onNavigate,
    debounceTimer: null,
  };

  // 입력 시 자동완성 검색 (150ms 디바운스)
  input.addEventListener('input', () => {
    if (ctx.debounceTimer) clearTimeout(ctx.debounceTimer);
    ctx.debounceTimer = setTimeout(() => searchHistory(ctx), 150);
  });

  // 포커스 시 전체 선택 + 최근 히스토리 표시
  input.addEventListener('focus', () => {
    input.select();
    if (input.value.length > 0) {
      searchHistory(ctx);
    }
  });

  // 키보드 네비게이션
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      ctx.selectedIndex = Math.min(ctx.selectedIndex + 1, ctx.results.length - 1);
      renderDropdown(ctx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      ctx.selectedIndex = Math.max(ctx.selectedIndex - 1, -1);
      renderDropdown(ctx);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (ctx.selectedIndex >= 0 && ctx.results[ctx.selectedIndex]) {
        navigateTo(ctx, ctx.results[ctx.selectedIndex].url);
      } else {
        navigateTo(ctx, input.value.trim());
      }
    } else if (e.key === 'Escape') {
      hideDropdown(ctx);
      input.blur();
    }
  });

  // 외부 클릭 시 드롭다운 닫기
  document.addEventListener('mousedown', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      hideDropdown(ctx);
    }
  });

  return {
    input,
    updateUrl: (url: string) => {
      if (document.activeElement !== input) {
        input.value = url;
      }
    },
  };
}

/** 히스토리 검색 후 드롭다운 표시 */
async function searchHistory(ctx: OmnibarContext): Promise<void> {
  const query = ctx.input.value.trim();
  if (query.length === 0) {
    hideDropdown(ctx);
    return;
  }

  try {
    ctx.results = await electronAPI.invoke('browser:history-search', { query, limit: 8 }) as BrowserHistoryEntry[];
  } catch {
    ctx.results = [];
  }

  ctx.selectedIndex = -1;

  if (ctx.results.length > 0) {
    renderDropdown(ctx);
    ctx.dropdown.classList.remove('hidden');
  } else {
    hideDropdown(ctx);
  }
}

/** 드롭다운 항목 렌더링 */
function renderDropdown(ctx: OmnibarContext): void {
  ctx.dropdown.innerHTML = '';

  ctx.results.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = `omnibar-item${i === ctx.selectedIndex ? ' selected' : ''}`;

    // URL에서 도메인 추출
    let domain = '';
    try {
      domain = new URL(entry.url).hostname;
    } catch {
      domain = entry.url;
    }

    item.innerHTML = `
      <span class="omnibar-item-title">${escapeHtml(entry.title)}</span>
      <span class="omnibar-item-url">${escapeHtml(domain)}</span>
    `;

    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // blur 방지
      navigateTo(ctx, entry.url);
    });

    item.addEventListener('mouseenter', () => {
      ctx.selectedIndex = i;
      ctx.dropdown.querySelectorAll('.omnibar-item').forEach((el, idx) => {
        el.classList.toggle('selected', idx === i);
      });
    });

    ctx.dropdown.appendChild(item);
  });

  ctx.dropdown.classList.remove('hidden');
}

/** URL로 이동 (검색어면 검색엔진으로) */
function navigateTo(ctx: OmnibarContext, rawInput: string): void {
  if (!rawInput) return;

  let url: string;
  if (isUrl(rawInput)) {
    url = rawInput.startsWith('http') ? rawInput : `https://${rawInput}`;
  } else {
    // 검색어로 판단 → 검색엔진 URL 생성
    url = SEARCH_ENGINE.replace('{q}', encodeURIComponent(rawInput));
  }

  ctx.input.value = url;
  hideDropdown(ctx);
  ctx.input.blur();
  ctx.onNavigate(url);
}

/** URL인지 검색어인지 판별 */
function isUrl(input: string): boolean {
  if (input.startsWith('http://') || input.startsWith('https://')) return true;
  // 도메인 형태 판별 (xxx.yyy)
  if (/^[\w-]+\.\w{2,}(\/.*)?$/.test(input)) return true;
  // localhost:port
  if (/^localhost(:\d+)?(\/.*)?$/.test(input)) return true;
  return false;
}

function hideDropdown(ctx: OmnibarContext): void {
  ctx.dropdown.classList.add('hidden');
  ctx.results = [];
  ctx.selectedIndex = -1;
}
