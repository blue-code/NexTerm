/**
 * CLI 브라우저 원격 제어 대상 패널 결정 로직 테스트
 */
import { describe, it, expect } from 'vitest';
import { resolveTargetPanelId, resolveBrowserPanelId } from '../src/renderer/ipc-panel-target';

describe('resolveTargetPanelId', () => {
  it('--panel-id가 주어지면 그 값을 우선한다', () => {
    expect(resolveTargetPanelId({ panelId: 'explicit-id' }, 'focused-id')).toBe('explicit-id');
  });

  it('--panel-id가 없으면 포커스된 패널을 대상으로 한다', () => {
    expect(resolveTargetPanelId({}, 'focused-id')).toBe('focused-id');
    expect(resolveTargetPanelId(undefined, 'focused-id')).toBe('focused-id');
  });

  it('--panel-id도 없고 포커스된 패널도 없으면 undefined', () => {
    expect(resolveTargetPanelId({}, null)).toBeUndefined();
    expect(resolveTargetPanelId(undefined, null)).toBeUndefined();
  });

  it('빈 문자열 panelId는 무시하고 포커스된 패널로 폴백한다', () => {
    expect(resolveTargetPanelId({ panelId: '' }, 'focused-id')).toBe('focused-id');
  });
});

describe('resolveBrowserPanelId', () => {
  const panels = [
    { id: 'term-1', type: 'terminal' as const },
    { id: 'browser-1', type: 'browser' as const },
  ];

  it('--panel-id가 주어지면 그 값을 우선한다 (검증 없이)', () => {
    expect(resolveBrowserPanelId({ panelId: 'explicit-id' }, 'term-1', panels)).toBe('explicit-id');
  });

  it('포커스된 패널이 실제로 브라우저면 그것을 사용한다', () => {
    expect(resolveBrowserPanelId({}, 'browser-1', panels)).toBe('browser-1');
  });

  it('포커스된 패널이 터미널이어도 브라우저 패널이 하나뿐이면 그것으로 폴백한다', () => {
    expect(resolveBrowserPanelId({}, 'term-1', panels)).toBe('browser-1');
  });

  it('브라우저 패널이 여러 개면 모호하므로 undefined', () => {
    const multi = [...panels, { id: 'browser-2', type: 'browser' as const }];
    expect(resolveBrowserPanelId({}, 'term-1', multi)).toBeUndefined();
  });

  it('브라우저 패널이 하나도 없으면 undefined', () => {
    expect(resolveBrowserPanelId({}, 'term-1', [{ id: 'term-1', type: 'terminal' as const }])).toBeUndefined();
  });
});
