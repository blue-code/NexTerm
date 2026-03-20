/**
 * 유틸리티 함수 단위 테스트
 */
import { describe, it, expect } from 'vitest';
import { generateId } from '../src/renderer/utils';

describe('generateId', () => {
  it('고유한 ID를 생성한다', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('타임스탬프-랜덤 형식을 따른다', () => {
    const id = generateId();
    expect(id).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it('빈 문자열이 아니다', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(0);
  });
});
