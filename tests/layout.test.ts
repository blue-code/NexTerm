/**
 * 분할 레이아웃 트리 조작 단위 테스트
 */
import { describe, it, expect } from 'vitest';
import { splitNodeAt, removeNodeFrom, type SplitNode, type SplitLeaf, type SplitBranch } from '../src/renderer/layout';

describe('splitNodeAt', () => {
  it('단일 리프를 수평 분할하면 branch 노드가 된다', () => {
    const leaf: SplitLeaf = { type: 'leaf', panelId: 'a' };
    const result = splitNodeAt(leaf, 'a', 'b', 'horizontal');

    expect(result.type).toBe('branch');
    const branch = result as SplitBranch;
    expect(branch.direction).toBe('horizontal');
    expect(branch.ratio).toBe(0.5);
    expect(branch.children[0]).toEqual({ type: 'leaf', panelId: 'a' });
    expect(branch.children[1]).toEqual({ type: 'leaf', panelId: 'b' });
  });

  it('대상이 아닌 리프는 변경되지 않는다', () => {
    const leaf: SplitLeaf = { type: 'leaf', panelId: 'x' };
    const result = splitNodeAt(leaf, 'a', 'b', 'horizontal');

    expect(result).toEqual(leaf);
  });

  it('중첩된 트리에서 특정 리프만 분할한다', () => {
    const tree: SplitBranch = {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', panelId: 'a' },
        { type: 'leaf', panelId: 'b' },
      ],
    };

    const result = splitNodeAt(tree, 'b', 'c', 'vertical') as SplitBranch;

    expect(result.type).toBe('branch');
    expect(result.children[0]).toEqual({ type: 'leaf', panelId: 'a' });

    const rightChild = result.children[1] as SplitBranch;
    expect(rightChild.type).toBe('branch');
    expect(rightChild.direction).toBe('vertical');
    expect(rightChild.children[0]).toEqual({ type: 'leaf', panelId: 'b' });
    expect(rightChild.children[1]).toEqual({ type: 'leaf', panelId: 'c' });
  });

  it('3단계 이상 깊이에서도 올바르게 분할한다', () => {
    const tree: SplitBranch = {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        {
          type: 'branch',
          direction: 'vertical',
          ratio: 0.5,
          children: [
            { type: 'leaf', panelId: 'a' },
            { type: 'leaf', panelId: 'b' },
          ],
        },
        { type: 'leaf', panelId: 'c' },
      ],
    };

    const result = splitNodeAt(tree, 'a', 'd', 'horizontal') as SplitBranch;
    const leftBranch = result.children[0] as SplitBranch;
    const deepBranch = leftBranch.children[0] as SplitBranch;

    expect(deepBranch.type).toBe('branch');
    expect(deepBranch.direction).toBe('horizontal');
    expect(deepBranch.children[0]).toEqual({ type: 'leaf', panelId: 'a' });
    expect(deepBranch.children[1]).toEqual({ type: 'leaf', panelId: 'd' });
  });
});

describe('removeNodeFrom', () => {
  it('왼쪽 자식 제거 시 오른쪽이 승격된다', () => {
    const tree: SplitBranch = {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', panelId: 'a' },
        { type: 'leaf', panelId: 'b' },
      ],
    };

    const result = removeNodeFrom(tree, 'a');
    expect(result).toEqual({ type: 'leaf', panelId: 'b' });
  });

  it('오른쪽 자식 제거 시 왼쪽이 승격된다', () => {
    const tree: SplitBranch = {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', panelId: 'a' },
        { type: 'leaf', panelId: 'b' },
      ],
    };

    const result = removeNodeFrom(tree, 'b');
    expect(result).toEqual({ type: 'leaf', panelId: 'a' });
  });

  it('중첩된 트리에서 리프 제거 시 형제가 승격된다', () => {
    const tree: SplitBranch = {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', panelId: 'a' },
        {
          type: 'branch',
          direction: 'vertical',
          ratio: 0.5,
          children: [
            { type: 'leaf', panelId: 'b' },
            { type: 'leaf', panelId: 'c' },
          ],
        },
      ],
    };

    const result = removeNodeFrom(tree, 'b') as SplitBranch;

    expect(result.type).toBe('branch');
    expect(result.children[0]).toEqual({ type: 'leaf', panelId: 'a' });
    expect(result.children[1]).toEqual({ type: 'leaf', panelId: 'c' });
  });

  it('단일 리프에 대해서는 변경 없이 반환한다', () => {
    const leaf: SplitLeaf = { type: 'leaf', panelId: 'a' };
    const result = removeNodeFrom(leaf, 'a');
    expect(result).toEqual(leaf);
  });

  it('존재하지 않는 ID 제거 시 트리가 변경되지 않는다', () => {
    const tree: SplitBranch = {
      type: 'branch',
      direction: 'horizontal',
      ratio: 0.5,
      children: [
        { type: 'leaf', panelId: 'a' },
        { type: 'leaf', panelId: 'b' },
      ],
    };

    const result = removeNodeFrom(tree, 'nonexistent') as SplitBranch;
    expect(result.children[0]).toEqual({ type: 'leaf', panelId: 'a' });
    expect(result.children[1]).toEqual({ type: 'leaf', panelId: 'b' });
  });
});
