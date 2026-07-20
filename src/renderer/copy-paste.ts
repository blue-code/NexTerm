/**
 * 터미널 복사/붙여넣기 키 판정 — 순수 로직 (DOM/state 무의존)
 *
 * 단축키 정책:
 *  - Ctrl+Shift+C → 복사 (선택 영역이 없으면 아무것도 안 하되 셸로는 전달하지 않음)
 *  - Ctrl+C       → 항상 SIGINT로 셸에 전달 (선택 여부와 무관)
 *  - Ctrl+V / Ctrl+Shift+V → 붙여넣기
 *
 * 예전에는 "선택 있으면 Ctrl+C가 복사"였지만, AI CLI 사용 중 선택이 남아 있는 채로
 * 중단(SIGINT)하려다 복사만 되는 혼동이 잦아 복사를 Ctrl+Shift+C로 분리했다.
 */

export interface ClipboardKeyEvent {
  type: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  key: string;
}

/** 키 이벤트가 복사/붙여넣기/통과 중 무엇인지 판정한다. */
export type ClipboardKeyDecision = 'copy' | 'paste' | 'pass';

export function decideClipboardKey(e: ClipboardKeyEvent): ClipboardKeyDecision {
  if (e.type !== 'keydown' || !e.ctrlKey) return 'pass';

  const key = e.key.toLowerCase();
  if (key === 'c' && e.shiftKey) return 'copy';
  if (key === 'v') return 'paste';
  return 'pass'; // Ctrl+C(shift 없음) 포함 — SIGINT 등은 그대로 셸로
}

export interface ClipboardSource {
  readText(): string;
  saveImageToTemp(): string | null;
}

/**
 * 붙여넣을 텍스트를 결정한다.
 * 텍스트 우선, 없으면 클립보드 이미지를 임시 파일로 저장해 경로(따옴표 포함)를 반환.
 * 둘 다 없으면 null.
 */
export function resolvePasteText(clipboard: ClipboardSource): string | null {
  const text = clipboard.readText();
  if (text) return text;
  const imgPath = clipboard.saveImageToTemp();
  return imgPath ? `"${imgPath}"` : null;
}
