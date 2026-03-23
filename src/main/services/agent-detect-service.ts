/**
 * AI 에이전트 감지 서비스
 * 터미널 출력에서 Claude Code, Codex, Gemini 등의 패턴을 매칭하여
 * 에이전트 활성화/완료/종료 상태를 추적한다.
 *
 * 데이터 흐름: TerminalService.onData() → feed() → 상태 변경 콜백
 */
import type { AgentStatus, AgentInfo, AgentPattern } from '../../shared/agent-types';

// ANSI 이스케이프 시퀀스 제거 정규식
// CSI 시퀀스, OSC 시퀀스, 문자 집합 선택 등 포괄적 처리
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][0-2]|\x1b\[[\?]?[0-9;]*[hlm]/g;

// 에이전트별 패턴 정의
const DEFAULT_PATTERNS: AgentPattern[] = [
  {
    name: 'Claude Code',
    identifyPatterns: [/\bclaude\b/i, /╭─/],
    completionPatterns: [/╰─/],
    exitPatterns: [/Goodbye!/],
  },
  {
    name: 'Codex',
    identifyPatterns: [/\bcodex\b/i],
    completionPatterns: [/codex>\s*$/],
    exitPatterns: [/exiting codex/i],
  },
  {
    name: 'Gemini',
    identifyPatterns: [/\bgemini\b/i],
    completionPatterns: [/gemini>\s*$/],
    exitPatterns: [/goodbye/i],
  },
];

// 패널별 내부 상태
interface PanelAgentState {
  status: AgentStatus;
  agentName: string | null;
  lineBuffer: string;       // 줄바꿈 전까지 누적되는 불완전 라인
  startedAt: number | null;
  completedAt: number | null;
  resetTimer: ReturnType<typeof setTimeout> | null; // completed → active 자동 복귀 타이머
}

type StatusChangeCallback = (panelId: string, status: AgentStatus, agentName: string | null) => void;

// completed → active 자동 복귀 시간 (밀리초)
const COMPLETED_RESET_DELAY = 5000;

export class AgentDetectService {
  private states = new Map<string, PanelAgentState>();
  private callbacks: StatusChangeCallback[] = [];
  private patterns: AgentPattern[] = DEFAULT_PATTERNS;

  /** 상태 변경 콜백 등록 */
  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  /** 터미널 출력 데이터 투입 — 라인 버퍼링 후 패턴 매칭 */
  feed(panelId: string, rawData: string): void {
    const state = this.getOrCreateState(panelId);

    // ANSI 이스케이프 제거
    const clean = stripAnsi(rawData);

    // 라인 버퍼에 추가
    state.lineBuffer += clean;

    // 줄바꿈 기준으로 완성된 라인 추출
    const lines = state.lineBuffer.split(/\r?\n/);
    // 마지막 요소는 아직 줄바꿈이 오지 않은 불완전 라인
    state.lineBuffer = lines.pop() ?? '';

    // 완성된 각 라인에 대해 패턴 매칭 수행
    for (const line of lines) {
      if (line.length === 0) continue;
      this.processLine(panelId, state, line);
    }
  }

  /** 패널 상태 조회 */
  getStatus(panelId: string): AgentStatus {
    return this.states.get(panelId)?.status ?? 'idle';
  }

  /** 패널의 에이전트 이름 조회 */
  getAgentName(panelId: string): string | null {
    return this.states.get(panelId)?.agentName ?? null;
  }

  /** 모든 활성 패널의 에이전트 정보 반환 */
  getAllStatuses(): Map<string, AgentInfo> {
    const result = new Map<string, AgentInfo>();
    for (const [panelId, state] of this.states) {
      result.set(panelId, {
        panelId,
        name: state.agentName,
        status: state.status,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
      });
    }
    return result;
  }

  /** 패널 제거 시 상태 정리 */
  removePanel(panelId: string): void {
    const state = this.states.get(panelId);
    if (state?.resetTimer) {
      clearTimeout(state.resetTimer);
    }
    this.states.delete(panelId);
  }

  // ── 내부 구현 ──

  private getOrCreateState(panelId: string): PanelAgentState {
    let state = this.states.get(panelId);
    if (!state) {
      state = {
        status: 'idle',
        agentName: null,
        lineBuffer: '',
        startedAt: null,
        completedAt: null,
        resetTimer: null,
      };
      this.states.set(panelId, state);
    }
    return state;
  }

  /** 완성된 한 라인에 대해 상태 전이 판단 */
  private processLine(panelId: string, state: PanelAgentState, line: string): void {
    // 종료 패턴은 어떤 상태에서든 idle로 전환 (active, completed 모두)
    if (state.status !== 'idle') {
      const matchedPattern = this.patterns.find(p => p.name === state.agentName);
      if (matchedPattern) {
        if (matchedPattern.exitPatterns.some(re => re.test(line))) {
          this.transitionTo(panelId, state, 'idle', null);
          return;
        }
      }
    }

    // 상태별 분기
    switch (state.status) {
      case 'idle':
        // 에이전트 식별 시도
        for (const pattern of this.patterns) {
          if (pattern.identifyPatterns.some(re => re.test(line))) {
            this.transitionTo(panelId, state, 'active', pattern.name);
            return;
          }
        }
        break;

      case 'active': {
        // 완료 패턴 매칭
        const activePattern = this.patterns.find(p => p.name === state.agentName);
        if (activePattern && activePattern.completionPatterns.some(re => re.test(line))) {
          this.transitionTo(panelId, state, 'completed', state.agentName);
        }
        break;
      }

      case 'completed':
        // completed 상태에서는 추가 전이 없음 (타이머로 active 복귀)
        break;
    }
  }

  /** 상태 전이 + 콜백 발화 (중복 전이 방지) */
  private transitionTo(
    panelId: string,
    state: PanelAgentState,
    newStatus: AgentStatus,
    agentName: string | null,
  ): void {
    // 동일 상태로의 전이는 무시
    if (state.status === newStatus) return;

    // 기존 복귀 타이머 취소
    if (state.resetTimer) {
      clearTimeout(state.resetTimer);
      state.resetTimer = null;
    }

    const prevStatus = state.status;
    state.status = newStatus;
    state.agentName = agentName;

    if (newStatus === 'active' && prevStatus === 'idle') {
      state.startedAt = Date.now();
      state.completedAt = null;
    } else if (newStatus === 'completed') {
      state.completedAt = Date.now();
      // 자동 복귀 타이머: completed → active (반복 작업 대응)
      state.resetTimer = setTimeout(() => {
        if (state.status === 'completed') {
          state.status = 'active';
          state.completedAt = null;
          state.resetTimer = null;
          // 자동 복귀는 콜백 발화하지 않음 (소음 방지)
        }
      }, COMPLETED_RESET_DELAY);
    } else if (newStatus === 'idle') {
      state.startedAt = null;
      state.completedAt = null;
    }

    // 콜백 발화
    for (const cb of this.callbacks) {
      cb(panelId, newStatus, agentName);
    }
  }
}

/** ANSI 이스케이프 시퀀스 제거 */
function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}
