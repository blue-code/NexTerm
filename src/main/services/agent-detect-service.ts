/**
 * AI 에이전트 감지 서비스
 * 터미널 출력에서 Claude Code, Codex, Gemini 등의 패턴을 매칭하여
 * 에이전트 활성화/완료/종료 상태를 추적한다.
 *
 * 상태 전이 모델 (패턴 매칭 + 출력 유휴 감지 병행):
 *   idle ──[식별 패턴]──→ active ──[유휴 3초 or 완료 패턴]──→ completed ──[15초]──→ idle
 *                           ↑                                      │
 *                           └──────[출력 재개 > 10bytes]───────────┘
 *   어디서든 ──[종료 패턴 or 프로세스 종료]──→ idle
 *
 * 데이터 흐름: TerminalService.onData() → feed() → 상태 변경 콜백
 */
import type { AgentStatus, AgentInfo, AgentPattern } from '../../shared/agent-types';

// ANSI 이스케이프 시퀀스 제거 — CSI, OSC, charset, mode set/reset, DCS, PM, APC 포괄
const ANSI_REGEX = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-2]|\x1b[P_^][^\x1b]*\x1b\\|\x1b[><=78DEHMNZ]/g;

// 출력 유휴 → completed 전환 시간 (밀리초)
const OUTPUT_IDLE_MS = 3000;
// completed → idle 자동 해제 시간 (밀리초)
const COMPLETED_DISMISS_MS = 15000;
// completed 상태에서 재활성화를 위한 최소 출력량 (bytes)
// 키 입력 에코(1~2자)와 에이전트 작업 출력을 구분하기 위한 임계값
const REACTIVATION_THRESHOLD = 10;

const DEFAULT_PATTERNS: AgentPattern[] = [
  {
    name: 'Claude Code',
    identifyPatterns: [/\bclaude\b/i],
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
  lastAgentName: string | null; // idle 복귀 후에도 이전 에이전트를 기억 (재활성화용)
  lineBuffer: string;
  startedAt: number | null;
  completedAt: number | null;
  idleTimer: ReturnType<typeof setTimeout> | null;     // active → completed 유휴 감지
  dismissTimer: ReturnType<typeof setTimeout> | null;   // completed → idle 자동 해제
}

type StatusChangeCallback = (panelId: string, status: AgentStatus, agentName: string | null) => void;

export class AgentDetectService {
  private states = new Map<string, PanelAgentState>();
  private callbacks: StatusChangeCallback[] = [];
  private patterns: AgentPattern[] = DEFAULT_PATTERNS;

  /** 상태 변경 콜백 등록 */
  onStatusChange(callback: StatusChangeCallback): void {
    this.callbacks.push(callback);
  }

  /** 터미널 출력 데이터 투입 — 활동 추적 + 라인 버퍼링 + 패턴 매칭 */
  feed(panelId: string, rawData: string): void {
    const state = this.getOrCreateState(panelId);
    const clean = stripAnsi(rawData);
    const trimmedLen = clean.trim().length;

    // active 상태: 출력이 올 때마다 유휴 타이머 리셋
    if (state.status === 'active') {
      this.resetIdleTimer(panelId, state);
    }

    // completed 또는 idle(이전 에이전트 기억 중): 의미 있는 출력이 오면 다시 active로 전환
    // 키 입력 에코(1~2자)는 무시, 에이전트 작업 출력만 감지
    if (state.status === 'completed' && trimmedLen > REACTIVATION_THRESHOLD) {
      this.transitionTo(panelId, state, 'active', state.agentName);
    } else if (state.status === 'idle' && state.lastAgentName && trimmedLen > REACTIVATION_THRESHOLD) {
      this.transitionTo(panelId, state, 'active', state.lastAgentName);
    }

    // 라인 버퍼링 후 패턴 매칭
    state.lineBuffer += clean;
    const lines = state.lineBuffer.split(/\r?\n/);
    state.lineBuffer = lines.pop() ?? '';

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

  /** 패널의 마지막 에이전트 이름 조회 (idle 상태에서도 기억 중인 이름) */
  getLastAgentName(panelId: string): string | null {
    return this.states.get(panelId)?.lastAgentName ?? null;
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
    if (state) {
      this.clearTimers(state);
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
        lastAgentName: null,
        lineBuffer: '',
        startedAt: null,
        completedAt: null,
        idleTimer: null,
        dismissTimer: null,
      };
      this.states.set(panelId, state);
    }
    return state;
  }

  /** 모든 타이머 정리 */
  private clearTimers(state: PanelAgentState): void {
    if (state.idleTimer) { clearTimeout(state.idleTimer); state.idleTimer = null; }
    if (state.dismissTimer) { clearTimeout(state.dismissTimer); state.dismissTimer = null; }
  }

  /**
   * 유휴 타이머 리셋 — active 상태에서 출력이 멈추면 completed로 전환
   * TUI 앱(Ink 기반 Claude Code 등)은 완료 패턴이 깨끗하게 매칭되지 않을 수 있으므로,
   * 출력 유휴를 보조 완료 신호로 사용한다.
   */
  private resetIdleTimer(panelId: string, state: PanelAgentState): void {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(() => {
      state.idleTimer = null;
      if (state.status === 'active') {
        this.transitionTo(panelId, state, 'completed', state.agentName);
      }
    }, OUTPUT_IDLE_MS);
  }

  /** 완성된 한 라인에 대해 상태 전이 판단 */
  private processLine(panelId: string, state: PanelAgentState, line: string): void {
    // 종료 패턴은 어떤 상태에서든 idle로 전환 + 에이전트 기억 초기화
    const trackingName = state.agentName || state.lastAgentName;
    if (state.status !== 'idle' || trackingName) {
      const matchedPattern = this.patterns.find(p => p.name === trackingName);
      if (matchedPattern && matchedPattern.exitPatterns.some(re => re.test(line))) {
        state.lastAgentName = null;
        this.transitionTo(panelId, state, 'idle', null);
        return;
      }
    }

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
        // 완료 패턴 매칭 (즉시 completed 전환 — 유휴 타이머보다 빠른 경로)
        const activePattern = this.patterns.find(p => p.name === state.agentName);
        if (activePattern && activePattern.completionPatterns.some(re => re.test(line))) {
          this.transitionTo(panelId, state, 'completed', state.agentName);
        }
        break;
      }

      case 'completed':
        // 출력 기반 재활성화는 feed()에서 처리
        // 여기서는 종료 패턴만 확인 (위에서 처리됨)
        break;
    }
  }

  /** 상태 전이 + 콜백 발화 — 모든 전이를 렌더러에 통지한다 (무음 전이 없음) */
  private transitionTo(
    panelId: string,
    state: PanelAgentState,
    newStatus: AgentStatus,
    agentName: string | null,
  ): void {
    if (state.status === newStatus) return;

    // 기존 타이머 전부 정리
    this.clearTimers(state);

    state.status = newStatus;
    state.agentName = agentName;

    switch (newStatus) {
      case 'active':
        if (!state.startedAt) state.startedAt = Date.now();
        state.completedAt = null;
        state.lastAgentName = agentName;
        // 출력 유휴 감지 시작
        this.resetIdleTimer(panelId, state);
        break;

      case 'completed':
        state.completedAt = Date.now();
        state.lastAgentName = agentName;
        // 자동 해제: completed → idle (인디케이터 소멸, 에이전트 기억은 유지)
        state.dismissTimer = setTimeout(() => {
          state.dismissTimer = null;
          if (state.status === 'completed') {
            this.transitionTo(panelId, state, 'idle', null);
          }
        }, COMPLETED_DISMISS_MS);
        break;

      case 'idle':
        state.startedAt = null;
        state.completedAt = null;
        // lastAgentName은 유지 — 종료 패턴에서만 초기화
        break;
    }

    // 콜백 발화
    for (const cb of this.callbacks) {
      cb(panelId, newStatus, agentName);
    }
  }
}

/** ANSI 이스케이프 시퀀스 제거 (CSI, OSC, DCS, PM, APC 등 포괄) */
function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}
