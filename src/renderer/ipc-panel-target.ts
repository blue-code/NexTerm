/**
 * CLI(nt) 명령의 대상 패널 ID 결정 로직 (순수 함수)
 * DOM/electron 의존이 없어 단독 단위 테스트가 가능하다.
 */
import type { PanelState } from '../shared/types';

/** panel-id/cwd 등 패널을 특정할 필요가 없는 일반 명령용 — 생략 시 포커스된 패널로 폴백 */
export function resolveTargetPanelId(
  params: Record<string, unknown> | undefined,
  focusedPanelId: string | null
): string | undefined {
  const explicit = params?.panelId as string | undefined;
  return explicit || focusedPanelId || undefined;
}

/**
 * 브라우저 패널 전용 대상 결정.
 * `nt`는 항상 터미널 패널에서 입력되므로 "포커스된 패널"은 대개 브라우저가 아니다.
 * 우선순위: ①--panel-id 명시 ②포커스된 패널이 실제로 브라우저인 경우 ③워크스페이스에 브라우저 패널이 정확히 하나뿐인 경우
 */
export function resolveBrowserPanelId(
  params: Record<string, unknown> | undefined,
  focusedPanelId: string | null,
  panels: Pick<PanelState, 'id' | 'type'>[]
): string | undefined {
  const explicit = params?.panelId as string | undefined;
  if (explicit) return explicit;

  const browserPanels = panels.filter((p) => p.type === 'browser');

  if (focusedPanelId && browserPanels.some((p) => p.id === focusedPanelId)) {
    return focusedPanelId;
  }

  if (browserPanels.length === 1) return browserPanels[0].id;

  return undefined;
}
