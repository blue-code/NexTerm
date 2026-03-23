// AI 에이전트 감지 관련 타입 정의

/** 에이전트 상태 */
export type AgentStatus = 'idle' | 'active' | 'completed';

/** 에이전트 정보 (런타임 상태) */
export interface AgentInfo {
  panelId: string;
  name: string | null;
  status: AgentStatus;
  startedAt: number | null;
  completedAt: number | null;
}

/** 에이전트 패턴 정의 (식별 → 활성화 → 완료 → 종료) */
export interface AgentPattern {
  name: string;
  identifyPatterns: RegExp[];   // 에이전트 존재 감지 (idle → active)
  completionPatterns: RegExp[]; // 작업 완료 감지 (active → completed)
  exitPatterns: RegExp[];       // 에이전트 종료 감지 (→ idle)
}

/** 에이전트 상태 변경 이벤트 페이로드 */
export interface AgentStatusChangePayload {
  panelId: string;
  status: AgentStatus;
  agentName: string | null;
  completedAt?: number;
}
