/**
 * NexTerm 렌더러 프로세스 — 엔트리 포인트
 * 모듈 초기화 + 설정 UI 바인딩 + DOMContentLoaded 처리
 */
import { state, electronAPI, setRenderCallbacks } from './state';
import { filterAvailableFonts } from './utils';
import { applyTheme, applyBackgroundImage, getThemeNames } from './themes';
import {
  fitAllTerminals,
  fitAllTerminalsImmediate,
  applyFontToAllTerminals,
  applyFontSizeToAllTerminals,
  initTerminalIpcListeners,
} from './terminal';
import { createWorkspace, initChildDetectListener, initOpenPathListener } from './workspace';
import { renderSidebar, renderWorkspaceContent } from './render';
import { initCommandPaletteEvents, setToggleSidebar } from './command-palette';
import { initKeyboardShortcuts, setToggleSidebarHandler } from './keyboard';
import { startPolling } from './polling';
import { restoreSession, initSessionListeners } from './session';
import { initIpcCommands } from './ipc-commands';
import { initAgentListeners } from './agent-indicator';
import { toggleFrequentCommands } from './frequent-commands';
import { initUsageStatus, applyUsageVisibility } from './usage-status';
import { createLogger } from './logger';
import { setLocale, getSupportedLocales } from '../shared/i18n';
// 로케일 등록 (import 시 자동 실행)
import '../shared/locales/ko';
import '../shared/locales/en';
import '../shared/locales/ja';
import '../shared/locales/zh';
import type { AppSettings } from '../shared/types';

const log = createLogger('app');

function normalizeShellSetting(shell?: string): string {
  return shell === 'bash.exe' ? 'git-bash' : (shell || 'powershell.exe');
}

// ── 렌더링 콜백 연결 ──
setRenderCallbacks(renderSidebar, renderWorkspaceContent);

// ── 사이드바 토글 ──

function toggleSidebar(): void {
  state.sidebarVisible = !state.sidebarVisible;
  const sidebar = document.getElementById('sidebar');
  const handle = document.getElementById('sidebar-resize-handle');
  sidebar?.classList.toggle('hidden', !state.sidebarVisible);
  handle?.classList.toggle('hidden', !state.sidebarVisible);
  // 사이드바 CSS 전환 완료 후 fit (디바운스 적용)
  setTimeout(() => fitAllTerminals(), 150);
}

setToggleSidebar(toggleSidebar);
setToggleSidebarHandler(toggleSidebar);
document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebar);

// ── 설정 UI 바인딩 ──

async function initSettings(): Promise<void> {
  try {
    state.settings = await electronAPI.invoke('settings:get') as AppSettings;
  } catch (err) {
    log.error('설정 로드 실패', err);
    state.settings = {} as AppSettings;
  }

  const fontSelect = document.getElementById('setting-font') as HTMLSelectElement | null;
  const fontPreview = document.getElementById('font-preview') as HTMLElement | null;
  if (fontSelect) {
    filterAvailableFonts(fontSelect);
    if (state.settings?.fontFamily) {
      const primary = state.settings.fontFamily.split(',')[0].trim();
      fontSelect.value = primary;
    }
    if (fontPreview) {
      fontPreview.style.fontFamily = `"${fontSelect.value}", monospace`;
    }
    fontSelect.addEventListener('change', () => {
      const selected = fontSelect.value;
      if (fontPreview) fontPreview.style.fontFamily = `"${selected}", monospace`;
      const fontFamily = `${selected}, monospace`;
      if (!state.settings) state.settings = {} as AppSettings;
      state.settings.fontFamily = fontFamily;
      electronAPI.invoke('settings:set', { fontFamily });
      applyFontToAllTerminals(fontFamily);
    });
  }

  const fontSizeInput = document.getElementById('setting-font-size') as HTMLInputElement | null;
  if (fontSizeInput) {
    fontSizeInput.value = String(state.settings?.fontSize || 14);
    fontSizeInput.addEventListener('change', () => {
      const size = parseInt(fontSizeInput.value, 10);
      if (size >= 8 && size <= 32) {
        if (!state.settings) state.settings = {} as AppSettings;
        state.settings.fontSize = size;
        electronAPI.invoke('settings:set', { fontSize: size });
        applyFontSizeToAllTerminals(size);
        if (fontPreview) fontPreview.style.fontSize = size + 'px';
      }
    });
  }

  const scrollbackInput = document.getElementById('setting-scrollback') as HTMLInputElement | null;
  if (scrollbackInput) {
    scrollbackInput.value = String(state.settings?.scrollbackLimit || 10000);
    scrollbackInput.addEventListener('change', () => {
      const limit = parseInt(scrollbackInput.value, 10);
      if (limit >= 1000 && limit <= 100000) {
        if (!state.settings) state.settings = {} as AppSettings;
        state.settings.scrollbackLimit = limit;
        electronAPI.invoke('settings:set', { scrollbackLimit: limit });
        for (const [, inst] of state.terminalInstances) {
          try {
            inst.terminal.options.scrollback = limit;
          } catch (err) {
            log.debug('스크롤백 적용 실패', err);
          }
        }
      }
    });
  }

  const themeSelect = document.getElementById('setting-theme') as HTMLSelectElement | null;
  if (themeSelect) {
    // 동적으로 모든 테마 옵션을 채운다
    themeSelect.innerHTML = '';
    for (const name of getThemeNames()) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      themeSelect.appendChild(opt);
    }
    themeSelect.value = state.settings?.theme || 'dark';
    applyTheme(themeSelect.value);
    themeSelect.addEventListener('change', () => {
      const theme = themeSelect.value;
      if (!state.settings) state.settings = {} as AppSettings;
      state.settings.theme = theme;
      electronAPI.invoke('settings:set', { theme });
      applyTheme(theme);
    });
  }

  const bgImageInput = document.getElementById('setting-bg-image') as HTMLInputElement | null;
  const bgImageBrowse = document.getElementById('btn-bg-image-browse');
  if (bgImageInput) {
    bgImageInput.value = state.settings?.backgroundImage || '';
    applyBackgroundImage(state.settings?.backgroundImage || '');
    bgImageInput.addEventListener('change', () => {
      const imgPath = bgImageInput.value.trim();
      if (!state.settings) state.settings = {} as AppSettings;
      state.settings.backgroundImage = imgPath;
      electronAPI.invoke('settings:set', { backgroundImage: imgPath });
      applyBackgroundImage(imgPath);
    });
  }
  if (bgImageBrowse) {
    bgImageBrowse.addEventListener('click', async () => {
      const result = await electronAPI.invoke('dialog:open-file', {
        filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
      }) as string | null;
      if (result && bgImageInput) {
        bgImageInput.value = result;
        bgImageInput.dispatchEvent(new Event('change'));
      }
    });
  }

  const shellSelect = document.getElementById('setting-shell') as HTMLSelectElement | null;
  if (shellSelect) {
    shellSelect.value = normalizeShellSetting(state.settings?.defaultShell);
    state.defaultShell = shellSelect.value;
    if (state.settings && state.settings.defaultShell !== shellSelect.value) {
      state.settings.defaultShell = shellSelect.value;
      electronAPI.invoke('settings:set', { defaultShell: shellSelect.value });
    }
    shellSelect.addEventListener('change', () => {
      state.defaultShell = shellSelect.value;
      if (!state.settings) state.settings = {} as AppSettings;
      state.settings.defaultShell = shellSelect.value;
      electronAPI.invoke('settings:set', { defaultShell: shellSelect.value });
    });
  }

  // 언어 설정
  const savedLang = state.settings?.language || 'ko';
  setLocale(savedLang);

  const langSelect = document.getElementById('setting-language') as HTMLSelectElement | null;
  if (langSelect) {
    // 지원 언어 옵션 동적 생성
    langSelect.innerHTML = '';
    for (const loc of getSupportedLocales()) {
      const opt = document.createElement('option');
      opt.value = loc.code;
      opt.textContent = loc.name;
      langSelect.appendChild(opt);
    }
    langSelect.value = savedLang;
    langSelect.addEventListener('change', () => {
      const lang = langSelect.value;
      setLocale(lang);
      if (!state.settings) state.settings = {} as AppSettings;
      state.settings.language = lang;
      electronAPI.invoke('settings:set', { language: lang });
    });
  }

  // 사용량 표시 항목 선택 (하단 상태바) — 체크한 제공자만 조회/표시
  const usageProviderCheckboxes = document.querySelectorAll<HTMLInputElement>('.usage-provider-checkbox');
  if (usageProviderCheckboxes.length > 0) {
    const visible = new Set(state.settings?.usageVisibleProviders ?? ['claude']);
    usageProviderCheckboxes.forEach((cb) => {
      cb.checked = visible.has(cb.value as AppSettings['usageVisibleProviders'][number]);
      cb.addEventListener('change', () => {
        const selected = Array.from(usageProviderCheckboxes)
          .filter((c) => c.checked)
          .map((c) => c.value) as AppSettings['usageVisibleProviders'];
        if (!state.settings) state.settings = {} as AppSettings;
        state.settings.usageVisibleProviders = selected;
        electronAPI.invoke('settings:set', { usageVisibleProviders: selected });
        applyUsageVisibility();
      });
    });
  }

  // 사용량 새로고침 주기
  const usageIntervalInput = document.getElementById('setting-usage-interval') as HTMLInputElement | null;
  if (usageIntervalInput) {
    usageIntervalInput.value = String(state.settings?.usageRefreshIntervalSec || 300);
    usageIntervalInput.addEventListener('change', () => {
      const sec = parseInt(usageIntervalInput.value, 10);
      if (sec >= 30 && sec <= 3600) {
        if (!state.settings) state.settings = {} as AppSettings;
        state.settings.usageRefreshIntervalSec = sec;
        electronAPI.invoke('settings:set', { usageRefreshIntervalSec: sec });
        applyUsageVisibility(); // 새 주기로 폴링 재시작
      }
    });
  }
}

// ── UI 이벤트 ──

function initUIEvents(): void {
  document.getElementById('btn-minimize')?.addEventListener('click', () => electronAPI.send('window:minimize'));
  document.getElementById('btn-maximize')?.addEventListener('click', () => electronAPI.send('window:maximize'));
  document.getElementById('btn-close')?.addEventListener('click', () => electronAPI.send('window:close'));

  document.getElementById('btn-new-workspace')?.addEventListener('click', () => createWorkspace());
  document.getElementById('btn-shortcuts')?.addEventListener('click', () => {
    document.getElementById('shortcuts-dialog')?.classList.toggle('hidden');
  });
  document.getElementById('btn-frequent-commands')?.addEventListener('click', (e) => {
    toggleFrequentCommands(e.currentTarget as HTMLElement);
  });
  document.getElementById('btn-close-shortcuts')?.addEventListener('click', () => {
    document.getElementById('shortcuts-dialog')?.classList.add('hidden');
  });
  document.querySelector('#shortcuts-dialog .dialog-backdrop')?.addEventListener('click', () => {
    document.getElementById('shortcuts-dialog')?.classList.add('hidden');
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    document.getElementById('settings-dialog')?.classList.toggle('hidden');
  });
  document.getElementById('btn-close-settings')?.addEventListener('click', () => {
    document.getElementById('settings-dialog')?.classList.add('hidden');
  });
  document.querySelector('#settings-dialog .dialog-backdrop')?.addEventListener('click', () => {
    document.getElementById('settings-dialog')?.classList.add('hidden');
  });

  // 사이드바 리사이즈
  const sidebarHandle = document.getElementById('sidebar-resize-handle');
  if (sidebarHandle) {
    let isDragging = false;
    sidebarHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      sidebarHandle.classList.add('dragging');

      const onMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const sidebar = document.getElementById('sidebar');
        const width = Math.max(180, Math.min(400, e.clientX));
        if (sidebar) sidebar.style.width = width + 'px';
        state.sidebarWidth = width;
        // 드래그 중에는 디바운스된 fit (50ms 내 중복 무시)
        fitAllTerminals();
      };

      const onUp = () => {
        isDragging = false;
        sidebarHandle.classList.remove('dragging');
        // 드래그 종료 시 즉시 fit
        fitAllTerminalsImmediate();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  window.addEventListener('resize', () => {
    requestAnimationFrame(fitAllTerminals);
  });
}

// ── 앱 초기화 ──

async function init(): Promise<void> {
  // IPC 리스너 등록 (가장 먼저 — 메인 프로세스 메시지 수신 준비)
  initTerminalIpcListeners();
  initSessionListeners();
  initChildDetectListener();
  initOpenPathListener();
  initAgentListeners();

  await initSettings();

  const restored = await restoreSession();

  if (!restored || state.workspaces.length === 0) {
    createWorkspace();
  } else {
    renderSidebar();
    renderWorkspaceContent();
  }

  initUIEvents();
  initCommandPaletteEvents();
  initKeyboardShortcuts();
  initIpcCommands();
  initUsageStatus();

  startPolling();

  log.info('앱 초기화 완료');
}

document.addEventListener('DOMContentLoaded', init);
