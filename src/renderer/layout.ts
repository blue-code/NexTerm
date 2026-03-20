/**
 * 분할 레이아웃 트리 조작 (순수 함수)
 * SplitNode 트리를 불변적으로 변환한다.
 */

export interface SplitLeaf {
  type: 'leaf';
  panelId: string;
}

export interface SplitBranch {
  type: 'branch';
  direction: 'horizontal' | 'vertical';
  ratio: number;
  children: [SplitNode, SplitNode];
}

export type SplitNode = SplitBranch | SplitLeaf;

/** 대상 리프 노드를 분할 노드로 교체 */
export function splitNodeAt(
  node: SplitNode,
  targetId: string,
  newId: string,
  direction: 'horizontal' | 'vertical',
): SplitNode {
  if (node.type === 'leaf') {
    if (node.panelId === targetId) {
      return {
        type: 'branch',
        direction,
        ratio: 0.5,
        children: [
          { type: 'leaf', panelId: targetId },
          { type: 'leaf', panelId: newId },
        ],
      };
    }
    return node;
  }
  return {
    ...node,
    children: [
      splitNodeAt(node.children[0], targetId, newId, direction),
      splitNodeAt(node.children[1], targetId, newId, direction),
    ],
  };
}

/** 대상 리프 노드를 제거하고 형제를 승격 */
export function removeNodeFrom(node: SplitNode, panelId: string): SplitNode {
  if (node.type === 'leaf') {
    return node;
  }
  const [left, right] = node.children;
  if (left.type === 'leaf' && left.panelId === panelId) return right;
  if (right.type === 'leaf' && right.panelId === panelId) return left;
  return {
    ...node,
    children: [
      removeNodeFrom(left, panelId),
      removeNodeFrom(right, panelId),
    ],
  };
}
