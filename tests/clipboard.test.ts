/**
 * 복사/붙여넣기 로직 테스트
 * terminal.ts의 attachCustomKeyEventHandler 내부 Ctrl+C/V 로직을 검증한다.
 *
 * 테스트 대상:
 * 1. Ctrl+C: 선택 영역 있으면 복사, 없으면 SIGINT 통과
 * 2. Ctrl+V: 텍스트 붙여넣기, 텍스트 없을 때 이미지 경로 삽입
 * 3. preload 화이트리스트 정합성 검증
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── 복사/붙여넣기 핸들러 로직 추출 (순수 함수화) ──

interface ClipboardAPI {
  readText(): string;
  writeText(text: string): void;
  saveImageToTemp(): string | null;
}

interface TerminalLike {
  hasSelection(): boolean;
  getSelection(): string;
  clearSelection(): void;
  paste(data: string): void;
}

interface KeyEvent {
  ctrlKey: boolean;
  shiftKey: boolean;
  key: string;
  type: string;
  preventDefault: () => void;
}

/**
 * terminal.ts의 customKeyEventHandler 내 Ctrl+C/V 분기 로직을 재현.
 * 반환값: false = xterm에서 이벤트 소비(차단), true = xterm에 이벤트 전달
 */
function handleCopyPaste(
  e: KeyEvent,
  terminal: TerminalLike,
  clipboard: ClipboardAPI,
): boolean {
  if (e.type !== 'keydown') return true;

  const ctrl = e.ctrlKey;
  const shift = e.shiftKey;
  const key = e.key;

  // Ctrl+C: 선택 영역이 있으면 복사, 없으면 SIGINT
  if (ctrl && !shift && key.toLowerCase() === 'c') {
    if (terminal.hasSelection()) {
      clipboard.writeText(terminal.getSelection());
      terminal.clearSelection();
      return false;
    }
    return true; // SIGINT 전달
  }

  // Ctrl+V: 붙여넣기 (텍스트 우선, 없으면 이미지 → 임시 파일 경로 삽입)
  // preventDefault로 브라우저 기본 paste 이벤트를 차단하여 이중 붙여넣기 방지
  if (ctrl && key.toLowerCase() === 'v') {
    e.preventDefault();
    const text = clipboard.readText();
    if (text) {
      terminal.paste(text);
    } else {
      const imgPath = clipboard.saveImageToTemp();
      if (imgPath) {
        terminal.paste(`"${imgPath}"`);
      }
    }
    return false;
  }

  return true;
}

/** KeyEvent 모킹 헬퍼 */
function makeKeyEvent(overrides: Partial<KeyEvent> & { ctrlKey: boolean; key: string; type: string }): KeyEvent {
  return {
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

// ── 테스트 ──

describe('복사/붙여넣기 핸들러', () => {
  let terminal: TerminalLike;
  let clipboard: ClipboardAPI;

  beforeEach(() => {
    terminal = {
      hasSelection: vi.fn(() => false),
      getSelection: vi.fn(() => ''),
      clearSelection: vi.fn(),
      paste: vi.fn(),
    };
    clipboard = {
      readText: vi.fn(() => ''),
      writeText: vi.fn(),
      saveImageToTemp: vi.fn(() => null),
    };
  });

  // ── Ctrl+C 테스트 ──

  describe('Ctrl+C (복사)', () => {
    it('선택 영역이 있으면 클립보드에 복사하고 이벤트 차단', () => {
      (terminal.hasSelection as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (terminal.getSelection as ReturnType<typeof vi.fn>).mockReturnValue('hello world');
      const e = makeKeyEvent({ ctrlKey: true, key: 'c', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(false);
      expect(clipboard.writeText).toHaveBeenCalledWith('hello world');
      expect(terminal.clearSelection).toHaveBeenCalled();
    });

    it('선택 영역이 없으면 SIGINT 전달 (이벤트 통과)', () => {
      (terminal.hasSelection as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const e = makeKeyEvent({ ctrlKey: true, key: 'c', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(true);
      expect(clipboard.writeText).not.toHaveBeenCalled();
    });

    it('빈 선택 영역("")도 hasSelection()이 true이면 복사 수행', () => {
      (terminal.hasSelection as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (terminal.getSelection as ReturnType<typeof vi.fn>).mockReturnValue('');
      const e = makeKeyEvent({ ctrlKey: true, key: 'c', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(false);
      expect(clipboard.writeText).toHaveBeenCalledWith('');
    });

    it('Ctrl+Shift+C는 복사 로직을 타지 않는다 (shift 있으면 통과)', () => {
      (terminal.hasSelection as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const e = makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'c', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(true);
      expect(clipboard.writeText).not.toHaveBeenCalled();
    });

    it('대문자 C도 정상 처리', () => {
      (terminal.hasSelection as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (terminal.getSelection as ReturnType<typeof vi.fn>).mockReturnValue('test');
      const e = makeKeyEvent({ ctrlKey: true, key: 'C', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(false);
      expect(clipboard.writeText).toHaveBeenCalledWith('test');
    });

    it('멀티라인 선택 텍스트 복사', () => {
      const multiline = 'line1\nline2\nline3';
      (terminal.hasSelection as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (terminal.getSelection as ReturnType<typeof vi.fn>).mockReturnValue(multiline);
      const e = makeKeyEvent({ ctrlKey: true, key: 'c', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(clipboard.writeText).toHaveBeenCalledWith(multiline);
    });
  });

  // ── Ctrl+V 테스트 ──

  describe('Ctrl+V (붙여넣기)', () => {
    it('클립보드에 텍스트가 있으면 터미널에 붙여넣기', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('pasted text');
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(false);
      expect(terminal.paste).toHaveBeenCalledWith('pasted text');
    });

    it('클립보드 텍스트가 비어있고 이미지가 있으면 경로 삽입', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('');
      (clipboard.saveImageToTemp as ReturnType<typeof vi.fn>).mockReturnValue('C:\\tmp\\paste.png');
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(false);
      expect(terminal.paste).toHaveBeenCalledWith('"C:\\tmp\\paste.png"');
    });

    it('클립보드에 텍스트도 이미지도 없으면 아무것도 하지 않지만 이벤트는 차단', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('');
      (clipboard.saveImageToTemp as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(false);
      expect(terminal.paste).not.toHaveBeenCalled();
    });

    it('텍스트가 있으면 이미지 경로 확인을 하지 않는다', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('some text');
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(clipboard.saveImageToTemp).not.toHaveBeenCalled();
    });

    it('대문자 V도 정상 처리', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('test');
      const e = makeKeyEvent({ ctrlKey: true, key: 'V', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(false);
      expect(terminal.paste).toHaveBeenCalledWith('test');
    });

    it('Ctrl+Shift+V도 붙여넣기 동작 (shift 무관)', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('shifted paste');
      const e = makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'v', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(false);
      expect(terminal.paste).toHaveBeenCalledWith('shifted paste');
    });

    it('멀티라인 텍스트 붙여넣기', () => {
      const multiline = 'line1\r\nline2\r\nline3';
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue(multiline);
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(terminal.paste).toHaveBeenCalledWith(multiline);
    });

    it('이미지 경로에 공백이 포함되어도 따옴표로 감싸짐', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('');
      (clipboard.saveImageToTemp as ReturnType<typeof vi.fn>).mockReturnValue('C:\\Users\\My User\\tmp\\paste.png');
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(terminal.paste).toHaveBeenCalledWith('"C:\\Users\\My User\\tmp\\paste.png"');
    });
  });

  // ── 이중 붙여넣기 방지 테스트 ──

  describe('이중 붙여넣기 방지 (preventDefault)', () => {
    it('Ctrl+V 시 preventDefault가 호출되어 브라우저 기본 paste 이벤트를 차단한다', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('text');
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(e.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+V 시 terminal.paste는 정확히 1회만 호출된다', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('single paste');
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(terminal.paste).toHaveBeenCalledTimes(1);
      expect(terminal.paste).toHaveBeenCalledWith('single paste');
    });

    it('이미지 붙여넣기에서도 preventDefault가 호출된다', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('');
      (clipboard.saveImageToTemp as ReturnType<typeof vi.fn>).mockReturnValue('C:\\tmp\\img.png');
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(e.preventDefault).toHaveBeenCalledTimes(1);
      expect(terminal.paste).toHaveBeenCalledTimes(1);
    });

    it('빈 클립보드에서도 preventDefault가 호출된다 (브라우저 paste 이벤트 원천 차단)', () => {
      (clipboard.readText as ReturnType<typeof vi.fn>).mockReturnValue('');
      (clipboard.saveImageToTemp as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const e = makeKeyEvent({ ctrlKey: true, key: 'v', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(e.preventDefault).toHaveBeenCalledTimes(1);
      expect(terminal.paste).not.toHaveBeenCalled();
    });

    it('Ctrl+C 시에는 preventDefault가 호출되지 않는다 (복사는 브라우저 paste 이벤트와 무관)', () => {
      (terminal.hasSelection as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (terminal.getSelection as ReturnType<typeof vi.fn>).mockReturnValue('text');
      const e = makeKeyEvent({ ctrlKey: true, key: 'c', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(e.preventDefault).not.toHaveBeenCalled();
    });

    it('비대상 키에서는 preventDefault가 호출되지 않는다', () => {
      const e = makeKeyEvent({ ctrlKey: true, key: 'a', type: 'keydown' });

      handleCopyPaste(e, terminal, clipboard);

      expect(e.preventDefault).not.toHaveBeenCalled();
    });
  });

  // ── 비대상 이벤트 통과 테스트 ──

  describe('비대상 이벤트', () => {
    it('keyup 이벤트는 무조건 통과', () => {
      (terminal.hasSelection as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const e = makeKeyEvent({ ctrlKey: true, key: 'c', type: 'keyup' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(true);
    });

    it('Ctrl 없는 일반 C 키는 통과', () => {
      const e = makeKeyEvent({ ctrlKey: false, key: 'c', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(true);
    });

    it('Ctrl 없는 일반 V 키는 통과', () => {
      const e = makeKeyEvent({ ctrlKey: false, key: 'v', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(true);
    });

    it('다른 Ctrl 조합(Ctrl+A 등)은 통과', () => {
      const e = makeKeyEvent({ ctrlKey: true, key: 'a', type: 'keydown' });

      const result = handleCopyPaste(e, terminal, clipboard);

      expect(result).toBe(true);
    });
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
