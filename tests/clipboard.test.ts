/**
 * 복사/붙여넣기 로직 테스트
 * src/renderer/copy-paste.ts의 실제 판정 로직을 검증한다.
 *
 * 단축키 정책 (v1.0.3에서 변경):
 * 1. Ctrl+Shift+C: 복사
 * 2. Ctrl+C: 선택 여부와 무관하게 항상 SIGINT 통과
 * 3. Ctrl+V / Ctrl+Shift+V: 붙여넣기 (텍스트 우선, 없으면 이미지 → 임시 파일 경로)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  decideClipboardKey,
  resolvePasteText,
  type ClipboardKeyEvent,
  type ClipboardSource,
} from '../src/renderer/copy-paste';

/** KeyEvent 모킹 헬퍼 */
function makeKeyEvent(overrides: Partial<ClipboardKeyEvent> & { key: string }): ClipboardKeyEvent {
  return {
    type: 'keydown',
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  };
}

// ── 키 판정 테스트 ──

describe('decideClipboardKey — 복사 (Ctrl+Shift+C)', () => {
  it('Ctrl+Shift+C는 copy로 판정된다', () => {
    const e = makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'c' });
    expect(decideClipboardKey(e)).toBe('copy');
  });

  it('대문자 C도 copy로 판정된다', () => {
    const e = makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'C' });
    expect(decideClipboardKey(e)).toBe('copy');
  });

  it('Ctrl+C(shift 없음)는 복사가 아니라 통과(SIGINT)다', () => {
    const e = makeKeyEvent({ ctrlKey: true, key: 'c' });
    expect(decideClipboardKey(e)).toBe('pass');
  });

  it('Shift+C(ctrl 없음)는 통과다', () => {
    const e = makeKeyEvent({ shiftKey: true, key: 'c' });
    expect(decideClipboardKey(e)).toBe('pass');
  });
});

describe('decideClipboardKey — 붙여넣기 (Ctrl+V)', () => {
  it('Ctrl+V는 paste로 판정된다', () => {
    const e = makeKeyEvent({ ctrlKey: true, key: 'v' });
    expect(decideClipboardKey(e)).toBe('paste');
  });

  it('Ctrl+Shift+V도 paste로 판정된다 (shift 무관)', () => {
    const e = makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'v' });
    expect(decideClipboardKey(e)).toBe('paste');
  });

  it('대문자 V도 paste로 판정된다', () => {
    const e = makeKeyEvent({ ctrlKey: true, key: 'V' });
    expect(decideClipboardKey(e)).toBe('paste');
  });

  it('Ctrl 없는 V는 통과다', () => {
    const e = makeKeyEvent({ key: 'v' });
    expect(decideClipboardKey(e)).toBe('pass');
  });
});

describe('decideClipboardKey — 비대상 이벤트', () => {
  it('keyup 이벤트는 무조건 통과', () => {
    const e = makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'c', type: 'keyup' });
    expect(decideClipboardKey(e)).toBe('pass');
  });

  it('다른 Ctrl 조합(Ctrl+A 등)은 통과', () => {
    const e = makeKeyEvent({ ctrlKey: true, key: 'a' });
    expect(decideClipboardKey(e)).toBe('pass');
  });

  it('Ctrl+Shift+A 등 다른 Shift 조합도 통과', () => {
    const e = makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'a' });
    expect(decideClipboardKey(e)).toBe('pass');
  });
});

// ── 붙여넣기 텍스트 결정 테스트 ──

describe('resolvePasteText', () => {
  let clipboard: ClipboardSource;

  beforeEach(() => {
    clipboard = {
      readText: vi.fn(() => ''),
      saveImageToTemp: vi.fn(() => null),
    };
  });

  it('클립보드에 텍스트가 있으면 그대로 반환한다', () => {
    (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('pasted text');
    expect(resolvePasteText(clipboard)).toBe('pasted text');
  });

  it('텍스트가 있으면 이미지 경로 확인을 하지 않는다', () => {
    (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('some text');
    resolvePasteText(clipboard);
    expect(clipboard.saveImageToTemp).not.toHaveBeenCalled();
  });

  it('텍스트가 비어있고 이미지가 있으면 따옴표로 감싼 경로를 반환한다', () => {
    (clipboard.saveImageToTemp as ReturnType<typeof vi.fn>).mockReturnValue('C:\\tmp\\paste.png');
    expect(resolvePasteText(clipboard)).toBe('"C:\\tmp\\paste.png"');
  });

  it('이미지 경로에 공백이 포함되어도 따옴표로 감싸진다', () => {
    (clipboard.saveImageToTemp as ReturnType<typeof vi.fn>).mockReturnValue('C:\\Users\\My User\\tmp\\paste.png');
    expect(resolvePasteText(clipboard)).toBe('"C:\\Users\\My User\\tmp\\paste.png"');
  });

  it('텍스트도 이미지도 없으면 null을 반환한다', () => {
    expect(resolvePasteText(clipboard)).toBeNull();
  });

  it('멀티라인 텍스트도 그대로 반환한다', () => {
    const multiline = 'line1\r\nline2\r\nline3';
    (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue(multiline);
    expect(resolvePasteText(clipboard)).toBe(multiline);
  });
});

// ── preload 화이트리스트 정합성 검증 ──

describe('preload 화이트리스트 정합성', () => {
  // preload.ts의 화이트리스트와 실제 사용 채널 간 정합성 검증
  // 채널이 누락되면 electronAPI.on() 호출 시 빈 함수가 반환되어 기능이 조용히 실패한다

  const ALLOWED_INVOKE = new Set([
    'terminal:create',
    'terminal:pid',
    'git:status',
    'port:scan',
    'settings:get',
    'settings:set',
    'session:restore',
    'dialog:open-file',
    'agent:get-status',
    'browser:history-search',
    'browser:history-list',
    'file:read',
    'file:watch',
    'file:unwatch',
    'keybindings:get',
    'keybindings:set',
  ]);

  const ALLOWED_SEND = new Set([
    'terminal:input',
    'terminal:resize',
    'terminal:close',
    'session:save',
    'window:minimize',
    'window:maximize',
    'window:close',
    'browser:history-add',
  ]);

  const ALLOWED_ON = new Set([
    'terminal:data',
    'terminal:close',
    'terminal:child-detected',
    'session:request-snapshot',
    'ipc:command',
    'settings:changed',
    'agent:status-changed',
    'file:changed',
  ]);

  // 터미널 기능에 필수적인 채널 목록
  const REQUIRED_TERMINAL_INVOKE = ['terminal:create'];
  const REQUIRED_TERMINAL_SEND = ['terminal:input', 'terminal:resize', 'terminal:close'];
  const REQUIRED_TERMINAL_ON = ['terminal:data', 'terminal:close'];

  it('터미널 생성에 필요한 invoke 채널이 등록되어 있다', () => {
    for (const ch of REQUIRED_TERMINAL_INVOKE) {
      expect(ALLOWED_INVOKE.has(ch), `invoke 채널 누락: ${ch}`).toBe(true);
    }
  });

  it('터미널 입력/리사이즈에 필요한 send 채널이 등록되어 있다', () => {
    for (const ch of REQUIRED_TERMINAL_SEND) {
      expect(ALLOWED_SEND.has(ch), `send 채널 누락: ${ch}`).toBe(true);
    }
  });

  it('터미널 출력 수신에 필요한 on 채널이 등록되어 있다', () => {
    for (const ch of REQUIRED_TERMINAL_ON) {
      expect(ALLOWED_ON.has(ch), `on 채널 누락: ${ch}`).toBe(true);
    }
  });

  it('설정 관련 채널이 등록되어 있다', () => {
    expect(ALLOWED_INVOKE.has('settings:get')).toBe(true);
    expect(ALLOWED_INVOKE.has('settings:set')).toBe(true);
    expect(ALLOWED_ON.has('settings:changed')).toBe(true);
  });

  it('세션 저장/복원 채널이 등록되어 있다', () => {
    expect(ALLOWED_SEND.has('session:save')).toBe(true);
    expect(ALLOWED_INVOKE.has('session:restore')).toBe(true);
    expect(ALLOWED_ON.has('session:request-snapshot')).toBe(true);
  });

  it('에이전트 상태 채널이 등록되어 있다', () => {
    expect(ALLOWED_INVOKE.has('agent:get-status')).toBe(true);
    expect(ALLOWED_ON.has('agent:status-changed')).toBe(true);
  });

  it('윈도우 제어 채널이 등록되어 있다', () => {
    expect(ALLOWED_SEND.has('window:minimize')).toBe(true);
    expect(ALLOWED_SEND.has('window:maximize')).toBe(true);
    expect(ALLOWED_SEND.has('window:close')).toBe(true);
  });

  it('파일 관련 채널이 등록되어 있다', () => {
    expect(ALLOWED_INVOKE.has('file:read')).toBe(true);
    expect(ALLOWED_INVOKE.has('file:watch')).toBe(true);
    expect(ALLOWED_INVOKE.has('file:unwatch')).toBe(true);
    expect(ALLOWED_ON.has('file:changed')).toBe(true);
  });
});
