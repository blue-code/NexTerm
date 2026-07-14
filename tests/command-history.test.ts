/**
 * 명령어 빈도 추적 단위 테스트
 *
 * 핵심 정책: "사용자가 실제로 입력한 명령"만 기록한다.
 *  - 직접 타이핑 + Enter → 기록
 *  - ↑/↓ 히스토리 탐색 후 Enter → 화면 라인에서 프롬프트를 제외하고 기록
 *  - paste(클립보드/제안 커밋/CLI 주입 등) → 기록 제외
 *  - 대체 버퍼(vim 등 TUI) 입력 → 기록 제외
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  consumeInputForHistory,
  markPastedInput,
  getTopCommands,
  clearAllCommands,
  dropPanelBuffer,
  type TerminalLike,
} from '../src/renderer/command-history';

const PANEL = 'panel-1';

/** 화면 버퍼를 흉내내는 가짜 터미널 — 테스트 중 라인/커서를 직접 갱신한다 */
function makeFakeTerm(): TerminalLike & {
  setLine(row: number, text: string, wrapped?: boolean): void;
  setCursor(row: number, col: number): void;
  setAlternate(alt: boolean): void;
} {
  const lines = new Map<number, { text: string; wrapped: boolean }>();
  const cursor = { row: 0, col: 0 };
  let bufType: 'normal' | 'alternate' = 'normal';

  return {
    buffer: {
      get active() {
        return {
          type: bufType,
          baseY: 0,
          cursorY: cursor.row,
          cursorX: cursor.col,
          getLine(y: number) {
            const entry = lines.get(y);
            if (!entry) return undefined;
            return {
              isWrapped: entry.wrapped,
              translateToString(_trim?: boolean, start?: number, end?: number) {
                return entry.text.slice(start ?? 0, end ?? undefined);
              },
            };
          },
        };
      },
    },
    setLine(row: number, text: string, wrapped = false) {
      lines.set(row, { text, wrapped });
    },
    setCursor(row: number, col: number) {
      cursor.row = row;
      cursor.col = col;
    },
    setAlternate(alt: boolean) {
      bufType = alt ? 'alternate' : 'normal';
    },
  };
}

function topCmds(): string[] {
  return getTopCommands(50).map((e) => e.cmd);
}

beforeEach(() => {
  clearAllCommands();
  dropPanelBuffer(PANEL);
});

describe('직접 타이핑 기록', () => {
  it('타이핑 후 Enter로 확정된 한 줄을 기록한다', () => {
    consumeInputForHistory(PANEL, 'git status\r');
    expect(topCmds()).toEqual(['git status']);
  });

  it('Backspace를 반영한다', () => {
    consumeInputForHistory(PANEL, 'lss\x7f\r');
    expect(topCmds()).toEqual(['ls']);
  });

  it('Ctrl+C는 입력 중이던 라인을 폐기한다', () => {
    consumeInputForHistory(PANEL, 'rm -rf /\x03');
    consumeInputForHistory(PANEL, 'ls\r');
    expect(topCmds()).toEqual(['ls']);
  });

  it('같은 명령은 count가 누적된다', () => {
    consumeInputForHistory(PANEL, 'npm test\r');
    consumeInputForHistory(PANEL, 'npm test\r');
    const top = getTopCommands(10);
    expect(top).toHaveLength(1);
    expect(top[0].count).toBe(2);
  });
});

describe('paste 입력 제외', () => {
  it('markPastedInput 직후 청크는 통째로 무시한다', () => {
    markPastedInput(PANEL);
    consumeInputForHistory(PANEL, 'npm run build\r');
    expect(topCmds()).toEqual([]);
  });

  it('paste와 타이핑이 섞인 라인은 기록하지 않는다', () => {
    consumeInputForHistory(PANEL, 'npm');
    markPastedInput(PANEL);
    consumeInputForHistory(PANEL, ' run build');
    consumeInputForHistory(PANEL, '\r');
    expect(topCmds()).toEqual([]);
  });

  it('paste로 오염된 라인이 확정되면 다음 라인부터는 다시 기록한다', () => {
    markPastedInput(PANEL);
    consumeInputForHistory(PANEL, 'pasted stuff');
    consumeInputForHistory(PANEL, '\r');
    consumeInputForHistory(PANEL, 'ls\r');
    expect(topCmds()).toEqual(['ls']);
  });

  it('개행으로 끝나는 즉시 실행형 paste 후에는 다음 직접 입력이 정상 기록된다', () => {
    markPastedInput(PANEL);
    consumeInputForHistory(PANEL, 'npm run dev\r'); // 제안 커밋 등 자동 실행형 paste
    consumeInputForHistory(PANEL, 'git diff\r');    // 이어서 사용자가 직접 타이핑
    expect(topCmds()).toEqual(['git diff']);
  });

  it('bracketed paste 시퀀스(ESC[200~ ... ESC[201~)는 내용을 버리고 라인을 오염 처리한다', () => {
    consumeInputForHistory(PANEL, '\x1b[200~echo hello\rworld\x1b[201~');
    consumeInputForHistory(PANEL, '\r');
    expect(topCmds()).toEqual([]);
  });
});

describe('히스토리 탐색(↑/↓) 기록', () => {
  it('↑로 불러온 명령을 Enter 시 화면에서 읽어 프롬프트 제외 후 기록한다', () => {
    const term = makeFakeTerm();
    // 프롬프트만 있는 상태에서 ↑
    term.setLine(0, 'PS> ');
    term.setCursor(0, 4);
    consumeInputForHistory(PANEL, '\x1b[A', term);
    // 셸이 히스토리 명령을 라인에 다시 그렸다고 가정
    term.setLine(0, 'PS> git log --oneline');
    term.setCursor(0, 21);
    consumeInputForHistory(PANEL, '\r', term);
    expect(topCmds()).toEqual(['git log --oneline']);
  });

  it('일부 타이핑 후 ↑를 눌러도 프롬프트 길이를 올바르게 계산한다', () => {
    const term = makeFakeTerm();
    term.setLine(0, 'PS> gi');
    term.setCursor(0, 6);
    consumeInputForHistory(PANEL, 'gi', term);
    consumeInputForHistory(PANEL, '\x1b[A', term);
    term.setLine(0, 'PS> git status');
    term.setCursor(0, 14);
    consumeInputForHistory(PANEL, '\r', term);
    expect(topCmds()).toEqual(['git status']);
  });

  it('애플리케이션 커서 모드(ESC O A)의 ↑도 인식한다', () => {
    const term = makeFakeTerm();
    term.setLine(0, '$ ');
    term.setCursor(0, 2);
    consumeInputForHistory(PANEL, '\x1bOA', term);
    term.setLine(0, '$ make clean');
    term.setCursor(0, 12);
    consumeInputForHistory(PANEL, '\r', term);
    expect(topCmds()).toEqual(['make clean']);
  });

  it('줄바꿈(wrapped)된 긴 명령도 논리 라인 전체를 읽는다', () => {
    const term = makeFakeTerm();
    term.setLine(0, 'PS> ');
    term.setCursor(0, 4);
    consumeInputForHistory(PANEL, '\x1b[A', term);
    // 2행에 걸친 명령: 0행 전체 + 1행(wrapped)
    term.setLine(0, 'PS> git commit -m ');
    term.setLine(1, '"long message"', true);
    term.setCursor(1, 14);
    consumeInputForHistory(PANEL, '\r', term);
    expect(topCmds()).toEqual(['git commit -m "long message"']);
  });

  it('히스토리 탐색 중 paste가 섞이면 기록하지 않는다', () => {
    const term = makeFakeTerm();
    term.setLine(0, 'PS> ');
    term.setCursor(0, 4);
    consumeInputForHistory(PANEL, '\x1b[A', term);
    markPastedInput(PANEL);
    consumeInputForHistory(PANEL, 'pasted', term);
    consumeInputForHistory(PANEL, '\r', term);
    expect(topCmds()).toEqual([]);
  });
});

describe('대체 버퍼(TUI) 제외', () => {
  it('vim 등 alternate 버퍼에서의 입력은 기록하지 않는다', () => {
    const term = makeFakeTerm();
    term.setAlternate(true);
    consumeInputForHistory(PANEL, ':wq\r', term);
    expect(topCmds()).toEqual([]);
  });
});
