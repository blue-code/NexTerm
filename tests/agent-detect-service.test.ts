/**
 * AI 에이전트 감지 서비스 단위 테스트
 * - ANSI 이스케이프 제거
 * - 라인 버퍼링
 * - 에이전트 식별/완료/종료 패턴 매칭
 * - 상태 전이 (idle → active → completed → idle)
 * - 오감지 방지 (일반 명령어 출력에서 에이전트로 잘못 감지하지 않음)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentDetectService } from '../src/main/services/agent-detect-service';
import type { AgentStatus } from '../src/shared/agent-types';

describe('AgentDetectService', () => {
  let service: AgentDetectService;
  let statusChanges: Array<{ panelId: string; status: AgentStatus; agentName: string | null }>;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new AgentDetectService();
    statusChanges = [];
    service.onStatusChange((panelId, status, agentName) => {
      statusChanges.push({ panelId, status, agentName });
    });
  });

  // ── ANSI 스트립 ──

  describe('ANSI 이스케이프 제거', () => {
    it('ANSI 색상 코드가 포함된 출력에서 에이전트를 식별한다', () => {
      service.feed('p1', '\x1b[32mclaude code\x1b[0m starting...\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].status).toBe('active');
      expect(statusChanges[0].agentName).toBe('Claude Code');
    });

    it('커서 이동 시퀀스를 제거하고 패턴을 매칭한다', () => {
      service.feed('p1', '\x1b[2J\x1b[Hclaude code session\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Claude Code');
    });

    it('OSC 시퀀스(타이틀 설정 등)가 제거되어 오감지하지 않는다', () => {
      // OSC 타이틀에 "claude"가 포함되어도 제거 후에는 매칭되지 않아야 함
      service.feed('p1', '\x1b]0;claude terminal\x07\n');
      expect(statusChanges).toHaveLength(0);
    });
  });

  // ── 라인 버퍼링 ──

  describe('라인 버퍼링', () => {
    it('줄바꿈 없이 들어오는 데이터를 버퍼에 누적한다', () => {
      service.feed('p1', 'claude co');
      expect(statusChanges).toHaveLength(0);

      service.feed('p1', 'de starting\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Claude Code');
    });

    it('한 번에 여러 줄이 들어오면 각각 처리한다', () => {
      service.feed('p1', 'claude code starting\nsome output\n');
      expect(statusChanges).toHaveLength(1); // 첫 줄에서 active
    });

    it('\\r\\n도 줄바꿈으로 처리한다', () => {
      service.feed('p1', 'claude code session\r\n');
      expect(statusChanges).toHaveLength(1);
    });
  });

  // ── Claude Code 감지 ──

  describe('Claude Code 감지', () => {
    it('"claude code" 키워드로 활성화를 감지한다', () => {
      service.feed('p1', 'claude code starting session...\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0]).toEqual({
        panelId: 'p1',
        status: 'active',
        agentName: 'Claude Code',
      });
    });

    it('"claude>" 프롬프트 패턴으로 활성화를 감지한다', () => {
      service.feed('p1', 'claude> what should I do?\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Claude Code');
    });

    it('╰─ 패턴으로 완료를 감지한다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p1', '╰─ done\n');
      expect(statusChanges).toHaveLength(2);
      expect(statusChanges[1]).toEqual({
        panelId: 'p1',
        status: 'completed',
        agentName: 'Claude Code',
      });
    });

    it('idle 상태에서는 완료 패턴에 반응하지 않는다', () => {
      service.feed('p1', '╰─ random text\n');
      expect(statusChanges).toHaveLength(0);
    });
  });

  // ── Codex 감지 ──

  describe('Codex 감지', () => {
    it('"codex>" 프롬프트로 활성화를 감지한다', () => {
      service.feed('p2', 'codex> \n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Codex');
    });

    it('"OpenAI Codex" 문자열로 활성화를 감지한다', () => {
      service.feed('p2', 'OpenAI Codex session started\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Codex');
    });

    it('codex> 프롬프트 복귀로 완료를 감지한다', () => {
      service.feed('p2', 'codex> \n');
      // active 상태에서 출력 후 다시 프롬프트
      service.feed('p2', 'some long output from codex tool execution that exceeds threshold\n');
      vi.advanceTimersByTime(3000); // 유휴 → completed
      statusChanges.length = 0;
      // 재활성화 후 프롬프트 복귀
      service.feed('p2', 'another long batch of output from codex agent doing work on the codebase\n');
      service.feed('p2', 'codex> \n');
      expect(statusChanges.some(c => c.status === 'completed')).toBe(true);
    });
  });

  // ── Gemini 감지 ──

  describe('Gemini 감지', () => {
    it('"gemini>" 프롬프트로 활성화를 감지한다', () => {
      service.feed('p3', 'gemini> \n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Gemini');
    });

    it('"Google Gemini" 문자열로 활성화를 감지한다', () => {
      service.feed('p3', 'Google Gemini CLI v1.0\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Gemini');
    });

    it('gemini> 프롬프트 복귀로 완료를 감지한다', () => {
      service.feed('p3', 'gemini> \n');
      service.feed('p3', 'processing a large response with lots of text content here\n');
      vi.advanceTimersByTime(3000);
      statusChanges.length = 0;
      service.feed('p3', 'another large batch of output from gemini agent processing your request\n');
      service.feed('p3', 'gemini> \n');
      expect(statusChanges.some(c => c.status === 'completed')).toBe(true);
    });
  });

  // ── 상태 전이 ──

  describe('상태 전이', () => {
    it('idle → active → completed 전이가 올바르게 동작한다', () => {
      service.feed('p1', 'claude code starting\n');
      expect(service.getStatus('p1')).toBe('active');

      service.feed('p1', '╰─ prompt\n');
      expect(service.getStatus('p1')).toBe('completed');
    });

    it('completed 상태에서 충분한 출력이 오면 active로 복귀한다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p1', '╰─ done\n');
      expect(service.getStatus('p1')).toBe('completed');

      // 50바이트 이상의 출력 → 재활성화
      service.feed('p1', 'This is a long output from the agent that exceeds the reactivation threshold of fifty bytes easily\n');
      expect(service.getStatus('p1')).toBe('active');
    });

    it('completed 상태에서 짧은 출력(키 에코 등)은 재활성화하지 않는다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p1', '╰─ done\n');
      expect(service.getStatus('p1')).toBe('completed');

      // 짧은 출력 → 재활성화 안됨
      service.feed('p1', 'y\n');
      expect(service.getStatus('p1')).toBe('completed');
    });

    it('종료 패턴으로 idle 상태로 전환된다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p1', 'Goodbye!\n');
      expect(service.getStatus('p1')).toBe('idle');
      expect(statusChanges[statusChanges.length - 1].status).toBe('idle');
    });

    it('종료 패턴은 completed 상태에서도 idle로 전환한다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p1', '╰─ done\n');
      service.feed('p1', 'Goodbye!\n');
      expect(service.getStatus('p1')).toBe('idle');
    });

    it('동일 상태로의 중복 전이는 콜백을 발화하지 않는다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p1', 'claude code again\n'); // 이미 active
      expect(statusChanges).toHaveLength(1); // 한 번만
    });

    it('출력 유휴 3초 후 active → completed 자동 전환', () => {
      service.feed('p1', 'claude code starting\n');
      expect(service.getStatus('p1')).toBe('active');

      vi.advanceTimersByTime(3000);
      expect(service.getStatus('p1')).toBe('completed');
    });

    it('completed → idle 자동 해제 (15초)', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p1', '╰─ done\n');
      expect(service.getStatus('p1')).toBe('completed');

      vi.advanceTimersByTime(15000);
      expect(service.getStatus('p1')).toBe('idle');
    });
  });

  // ── 오감지 방지 ──

  describe('오감지 방지', () => {
    it('일반 "claude" 단어만으로는 활성화하지 않는다', () => {
      service.feed('p1', 'pip install claude-sdk\n');
      expect(statusChanges).toHaveLength(0);
      expect(service.getStatus('p1')).toBe('idle');
    });

    it('일반 "codex" 단어만으로는 활성화하지 않는다', () => {
      service.feed('p1', 'npm install codex-cli\n');
      expect(statusChanges).toHaveLength(0);
    });

    it('일반 "gemini" 단어만으로는 활성화하지 않는다', () => {
      service.feed('p1', 'curl https://api.gemini.com/v1/status\n');
      expect(statusChanges).toHaveLength(0);
    });

    it('npm 패키지 출력에서 codex가 포함되어도 오감지하지 않는다', () => {
      service.feed('p1', '+ codex-cli@1.2.0\n');
      service.feed('p1', 'added 5 packages in 2s\n');
      expect(statusChanges).toHaveLength(0);
    });

    it('git log에 claude가 포함되어도 오감지하지 않는다', () => {
      service.feed('p1', 'abc1234 feat: add claude integration support\n');
      expect(statusChanges).toHaveLength(0);
    });

    it('API 응답에 gemini가 포함되어도 오감지하지 않는다', () => {
      service.feed('p1', '{"constellation": "gemini", "stars": 85}\n');
      expect(statusChanges).toHaveLength(0);
    });

    it('idle 상태에서 lastAgentName으로 재활성화하지 않는다', () => {
      // 에이전트 감지 → 종료
      service.feed('p1', 'claude code starting\n');
      service.feed('p1', 'Goodbye!\n');
      expect(service.getStatus('p1')).toBe('idle');

      // idle 복귀 후 일반 명령어 출력 → 재활성화하면 안 됨
      service.feed('p1', 'ls -la some-directory-with-long-filenames-to-exceed-threshold\n');
      expect(service.getStatus('p1')).toBe('idle');
    });

    it('OSC 타이틀에 에이전트 이름이 포함되어도 오감지하지 않는다', () => {
      service.feed('p1', '\x1b]2;codex-project\x07\n');
      expect(statusChanges).toHaveLength(0);
    });

    it('환경변수나 경로에 에이전트 이름이 포함되어도 오감지하지 않는다', () => {
      service.feed('p1', 'C:\\Users\\dev\\codex-workspace\\src\\main.ts\n');
      expect(statusChanges).toHaveLength(0);
    });
  });

  // ── 다중 패널 독립성 ──

  describe('다중 패널', () => {
    it('패널별로 독립적인 상태를 유지한다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p2', 'codex> \n');

      expect(service.getStatus('p1')).toBe('active');
      expect(service.getStatus('p2')).toBe('active');
      expect(service.getAgentName('p1')).toBe('Claude Code');
      expect(service.getAgentName('p2')).toBe('Codex');
    });

    it('한 패널의 완료가 다른 패널에 영향을 주지 않는다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p2', 'codex> \n');

      service.feed('p1', '╰─ done\n');
      expect(service.getStatus('p1')).toBe('completed');
      expect(service.getStatus('p2')).toBe('active');
    });
  });

  // ── 패널 정리 ──

  describe('패널 정리', () => {
    it('패널 제거 시 상태가 정리된다', () => {
      service.feed('p1', 'claude code starting\n');
      service.removePanel('p1');
      expect(service.getStatus('p1')).toBe('idle');
    });

    it('제거된 패널은 getAllStatuses에 포함되지 않는다', () => {
      service.feed('p1', 'claude code starting\n');
      service.removePanel('p1');
      expect(service.getAllStatuses().has('p1')).toBe(false);
    });
  });

  // ── 전체 상태 조회 ──

  describe('getAllStatuses', () => {
    it('모든 활성 패널의 상태를 반환한다', () => {
      service.feed('p1', 'claude code starting\n');
      service.feed('p2', 'codex> \n');

      const statuses = service.getAllStatuses();
      expect(statuses.size).toBe(2);
      expect(statuses.get('p1')?.name).toBe('Claude Code');
      expect(statuses.get('p2')?.name).toBe('Codex');
    });
  });
});
