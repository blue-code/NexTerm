/**
 * 터미널 내 검색 오버레이
 */
import { state } from './state';

export function toggleTerminalSearch(panelId: string): void {
  const pane = document.querySelector(`.split-pane[data-panel-id="${panelId}"]`);
  if (!pane) return;

  let overlay = pane.querySelector('.search-overlay');
  if (overlay) {
    overlay.remove();
    return;
  }

  overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <input type="text" placeholder="검색..." autofocus>
    <span class="search-count"></span>
    <button class="panel-btn" data-dir="prev" title="이전">▲</button>
    <button class="panel-btn" data-dir="next" title="다음">▼</button>
    <button class="panel-btn" data-dir="close" title="닫기">✕</button>
  `;

  const input = overlay.querySelector('input')!;
  const instance = state.terminalInstances.get(panelId);

  input.addEventListener('input', () => {
    if (instance?.searchAddon) {
      instance.searchAddon.findNext(input.value);
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) instance?.searchAddon.findPrevious(input.value);
      else instance?.searchAddon.findNext(input.value);
    }
    if (e.key === 'Escape') overlay!.remove();
  });

  overlay.querySelectorAll('.panel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = (btn as HTMLElement).dataset.dir;
      if (dir === 'close') overlay!.remove();
      else if (dir === 'prev') instance?.searchAddon.findPrevious(input.value);
      else if (dir === 'next') instance?.searchAddon.findNext(input.value);
    });
  });

  (pane as HTMLElement).style.position = 'relative';
  pane.appendChild(overlay);
  input.focus();
}
