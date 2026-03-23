/**
 * AI 에이전트 상태 인디케이터
 * 패널 헤더와 사이드바에 에이전트 활성/완료 상태를 표시한다.
 */
import { state, electronAPI, triggerSidebarRender } from './state';
import type { AgentStatusChangePayload } from '../../shared/agent-types';

/** 에이전트 상태 변경 IPC 리스너 등록 */
export function initAgentListeners(): void {
  electronAPI.on('agent:status-changed', (payload: unknown) => {
    const data = payload as AgentStatusChangePayload;
    const { panelId, status, agentName } = data;

    if (status === 'idle') {
      state.agentStatuses.delete(panelId);
    } else {
      state.agentStatuses.set(panelId, {
        panelId,
        name: agentName,
        status,
        startedAt: state.agentStatuses.get(panelId)?.startedAt ?? Date.now(),
        completedAt: data.completedAt ?? null,
      });
    }

    // 패널 헤더 배지 갱신
    updatePanelBadge(panelId);
    // 사이드바에 에이전트 상태 반영
    triggerSidebarRender();
  });
}

/** 패널 헤더의 에이전트 배지를 갱신한다 */
function updatePanelBadge(panelId: string): void {
  const pane = document.querySelector(`.split-pane[data-panel-id="${panelId}"]`);
  if (!pane) return;

  const header = pane.querySelector('.panel-header');
  if (!header) return;

  // 기존 배지 제거
  header.querySelector('.agent-badge')?.remove();

  const info = state.agentStatuses.get(panelId);
  if (!info || info.status === 'idle') {
    pane.classList.remove('agent-active', 'agent-completed');
    return;
  }

  // 배지 생성
  const badge = document.createElement('span');
  badge.className = `agent-badge agent-${info.status}`;
  badge.textContent = info.name ?? 'AI';
  badge.title = info.status === 'active'
    ? `${info.name} 작업 중...`
    : `${info.name} 작업 완료`;

  // 패널 타이틀 영역에 삽입
  const titleDiv = header.querySelector('.panel-title');
  if (titleDiv) {
    titleDiv.appendChild(badge);
  }

  // 패널 보더 효과
  pane.classList.toggle('agent-active', info.status === 'active');
  pane.classList.toggle('agent-completed', info.status === 'completed');
}

/** 워크스페이스에 활성 에이전트가 있는지 확인 */
export function getWorkspaceAgentStatus(workspaceId: string): { hasActive: boolean; hasCompleted: boolean; agentName: string | null } {
  const ws = state.workspaces.find(w => w.id === workspaceId);
  if (!ws) return { hasActive: false, hasCompleted: false, agentName: null };

  let hasActive = false;
  let hasCompleted = false;
  let agentName: string | null = null;

  for (const panel of ws.panels) {
    const info = state.agentStatuses.get(panel.id);
    if (info) {
      if (info.status === 'active') {
        hasActive = true;
        agentName = info.name;
      }
      if (info.status === 'completed') {
        hasCompleted = true;
        agentName = info.name;
      }
    }
  }

  return { hasActive, hasCompleted, agentName };
}
