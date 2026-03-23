/**
 * AI 에이전트 감지 서비스 단위 테스트
 * - ANSI 이스케이프 제거
 * - 라인 버퍼링
 * - 에이전트 식별/완료/종료 패턴 매칭
 * - 상태 전이 (idle → active → completed → idle)
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
      // ANSI 색상이 감싼 "claude" 텍스트
      service.feed('p1', '\x1b[32mclaude\x1b[0m starting...\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].status).toBe('active');
      expect(statusChanges[0].agentName).toBe('Claude Code');
    });

    it('커서 이동 시퀀스를 제거하고 패턴을 매칭한다', () => {
      service.feed('p1', '\x1b[2J\x1b[Hclaude session\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Claude Code');
    });

    it('OSC 시퀀스(타이틀 설정 등)를 제거한다', () => {
      service.feed('p1', '\x1b]0;claude terminal\x07\n');
      service.feed('p1', '╭─\n');
      expect(statusChanges.some(c => c.agentName === 'Claude Code')).toBe(true);
    });
  });

  // ── 라인 버퍼링 ──

  describe('라인 버퍼링', () => {
    it('줄바꿈 없이 들어오는 데이터를 버퍼에 누적한다', () => {
      service.feed('p1', 'clau');
      expect(statusChanges).toHaveLength(0);

      service.feed('p1', 'de\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Claude Code');
    });

    it('한 번에 여러 줄이 들어오면 각각 처리한다', () => {
      service.feed('p1', 'claude starting\nsome output\n');
      expect(statusChanges).toHaveLength(1); // 첫 줄에서 active
    });

    it('\\r\\n도 줄바꿈으로 처리한다', () => {
      service.feed('p1', 'claude session\r\n');
      expect(statusChanges).toHaveLength(1);
    });
  });

  // ── Claude Code 감지 ──

  describe('Claude Code 감지', () => {
    it('claude 키워드로 활성화를 감지한다', () => {
      service.feed('p1', 'claude starting session...\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0]).toEqual({
        panelId: 'p1',
        status: 'active',
        agentName: 'Claude Code',
      });
    });

    it('╭─ 패턴으로도 활성화를 감지한다', () => {
      service.feed('p1', '╭─ some info\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Claude Code');
    });

    it('╰─ 패턴으로 완료를 감지한다', () => {
      // 먼저 활성화
      service.feed('p1', 'claude starting\n');
      // 완료
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
    it('codex 키워드로 활성화를 감지한다', () => {
      service.feed('p2', 'codex starting...\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Codex');
    });

    it('codex> 프롬프트 복귀로 완료를 감지한다', () => {
      service.feed('p2', 'codex running\n');
      service.feed('p2', 'codex> \n');
      expect(statusChanges).toHaveLength(2);
      expect(statusChanges[1].status).toBe('completed');
    });
  });

  // ── Gemini 감지 ──

  describe('Gemini 감지', () => {
    it('gemini 키워드로 활성화를 감지한다', () => {
      service.feed('p3', 'gemini session started\n');
      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0].agentName).toBe('Gemini');
    });

    it('gemini> 프롬프트 복귀로 완료를 감지한다', () => {
      service.feed('p3', 'gemini starting\n');
      service.feed('p3', 'gemini> \n');
      expect(statusChanges).toHaveLength(2);
      expect(statusChanges[1].status).toBe('completed');
    });
  });

  // ── 상태 전이 ──

  describe('상태 전이', () => {
    it('idle → active → completed 전이가 올바르게 동작한다', () => {
      service.feed('p1', 'claude starting\n');
      expect(service.getStatus('p1')).toBe('active');

      service.feed('p1', '╰─ prompt\n');
      expect(service.getStatus('p1')).toBe('completed');
    });

    it('completed 상태는 자동으로 active로 복귀한다 (반복 작업 대응)', () => {
      service.feed('p1', 'claude starting\n');
      service.feed('p1', '╰─ done\n');
      expect(service.getStatus('p1')).toBe('completed');

      // 자동 복귀 타이머 (5초)
      vi.advanceTimersByTime(5000);
      expect(service.getStatus('p1')).toBe('active');
    });

    it('종료 패턴으로 idle 상태로 전환된다', () => {
      service.feed('p1', 'claude starting\n');
      service.feed('p1', 'Goodbye!\n');
      expect(service.getStatus('p1')).toBe('idle');
      expect(statusChanges[statusChanges.length - 1].status).toBe('idle');
    });

    it('종료 패턴은 completed 상태에서도 idle로 전환한다', () => {
      service.feed('p1', 'claude starting\n');
      service.feed('p1', '╰─ done\n');
      service.feed('p1', 'Goodbye!\n');
      expect(service.getStatus('p1')).toBe('idle');
    });

    it('동일 상태로의 중복 전이는 콜백을 발화하지 않는다', () => {
      service.feed('p1', 'claude starting\n');
      service.feed('p1', 'claude again\n'); // 이미 active
      expect(statusChanges).toHaveLength(1); // 한 번만
    });
  });

  // ── 다중 패널 독립성 ──

  describe('다중 패널', () => {
    it('패널별로 독립적인 상태를 유지한다', () => {
      service.feed('p1', 'claude starting\n');
      service.feed('p2', 'codex starting\n');

      expect(service.getStatus('p1')).toBe('active');
      expect(service.getStatus('p2')).toBe('active');
      expect(service.getAgentName('p1')).toBe('Claude Code');
      expect(service.getAgentName('p2')).toBe('Codex');
    });

    it('한 패널의 완료가 다른 패널에 영향을 주지 않는다', () => {
      service.feed('p1', 'claude starting\n');
      service.feed('p2', 'codex starting\n');

      service.feed('p1', '╰─ done\n');
      expect(service.getStatus('p1')).toBe('completed');
      expect(service.getStatus('p2')).toBe('active');
    });
  });

  // ── 패널 정리 ──

  describe('패널 정리', () => {
    it('패널 제거 시 상태가 정리된다', () => {
      service.feed('p1', 'claude starting\n');
      service.removePanel('p1');
      expect(service.getStatus('p1')).toBe('idle');
    });

    it('제거된 패널은 getAllStatuses에 포함되지 않는다', () => {
      service.feed('p1', 'claude starting\n');
      service.removePanel('p1');
      expect(service.getAllStatuses().has('p1')).toBe(false);
    });
  });

  // ── 전체 상태 조회 ──

  describe('getAllStatuses', () => {
    it('모든 활성 패널의 상태를 반환한다', () => {
      service.feed('p1', 'claude starting\n');
      service.feed('p2', 'codex starting\n');

      const statuses = service.getAllStatuses();
      expect(statuses.size).toBe(2);
      expect(statuses.get('p1')?.name).toBe('Claude Code');
      expect(statuses.get('p2')?.name).toBe('Codex');
    });
  });
});
