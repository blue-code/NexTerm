/**
 * 리스닝 포트 스캐너
 *
 * conpty에서 셸을 spawn하면 중간 프로세스(conhost.exe 등)가 종료되어
 * 부모-자식 체인이 끊어지는 Windows 특성이 있다.
 *
 * 해결 전략 — 누적 PID 추적:
 *   매 폴링 주기마다 conpty PID의 자식 트리를 수집하면서,
 *   이전 주기에서 이미 수집된 PID도 함께 시작점으로 사용한다.
 *   이렇게 하면 중간 프로세스가 종료되어 트리가 끊어져도,
 *   해당 프로세스가 살아있던 이전 주기에서 기록된 덕분에
 *   그 자식들을 계속 추적할 수 있다.
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PortInfo {
  port: number;
  pid: number;
}

interface ProcessEntry {
  pid: number;
  parentPid: number;
}

export class PortScannerService {
  // 프로세스 트리 캐시 (3초 TTL)
  private treeCache: { data: ProcessEntry[]; timestamp: number } | null = null;
  // 포트 캐시 (2초 TTL)
  private portCache: { data: PortInfo[]; timestamp: number } | null = null;
  private readonly TREE_CACHE_TTL = 3000;
  private readonly PORT_CACHE_TTL = 2000;

  // 누적 PID 추적: conpty PID → 지금까지 관측된 모든 자손 PID
  // 중간 프로세스가 죽어도 이전에 기록된 PID를 시작점으로 사용하여 체인을 유지
  private cumulativePids = new Map<number, Set<number>>();

  /**
   * 여러 PID를 한 번에 조회 (배치 처리, 프로세스 트리/포트는 1회만 조회)
   */
  async scanByPids(pids: number[]): Promise<Record<number, number[]>> {
    if (!pids.length) return {};

    const [tree, ports] = await Promise.all([
      this.getProcessTree(),
      this.getListeningPorts(),
    ]);

    // parentPid → children 인덱스 (빠른 조회)
    const childrenOf = new Map<number, number[]>();
    for (const entry of tree) {
      if (!childrenOf.has(entry.parentPid)) childrenOf.set(entry.parentPid, []);
      childrenOf.get(entry.parentPid)!.push(entry.pid);
    }

    // 현재 살아있는 PID 집합
    const alivePids = new Set(tree.map(e => e.pid));

    const result: Record<number, number[]> = {};
    for (const pid of pids) {
      if (!pid || pid <= 0) {
        result[pid] = [];
        continue;
      }

      // 누적 PID 세트 초기화/가져오기
      if (!this.cumulativePids.has(pid)) {
        this.cumulativePids.set(pid, new Set());
      }
      const cumulative = this.cumulativePids.get(pid)!;

      // 시작점: conpty PID 자체 + 이전에 기록된 누적 PID
      const seeds = new Set<number>([pid, ...cumulative]);

      // 시작점들부터 현재 트리에서 자식 수집
      const descendants = new Set<number>();
      const queue = Array.from(seeds);

      while (queue.length > 0) {
        const current = queue.pop()!;
        const children = childrenOf.get(current);
        if (children) {
          for (const child of children) {
            if (!descendants.has(child)) {
              descendants.add(child);
              queue.push(child);
            }
          }
        }
      }
      descendants.add(pid);

      // 누적 세트 갱신: 현재 살아있는 자손만 보존 + 새로 발견된 자손 추가
      // 죽은 PID는 더 이상 시작점으로 쓸 필요 없으므로 정리
      cumulative.clear();
      for (const d of descendants) {
        if (alivePids.has(d)) {
          cumulative.add(d);
        }
      }

      result[pid] = ports
        .filter(p => descendants.has(p.pid))
        .map(p => p.port);
    }
    return result;
  }

  /** 추적 중인 conpty PID 제거 (터미널 종료 시) */
  removePid(pid: number): void {
    this.cumulativePids.delete(pid);
  }

  /** wmic로 전체 프로세스 부모-자식 관계 조회 */
  private async getProcessTree(): Promise<ProcessEntry[]> {
    if (this.treeCache && Date.now() - this.treeCache.timestamp < this.TREE_CACHE_TTL) {
      return this.treeCache.data;
    }

    try {
      const { stdout } = await execAsync(
        'wmic process get ProcessId,ParentProcessId /format:csv',
        { timeout: 5000 }
      );

      const entries: ProcessEntry[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        // CSV 형식: Node,ParentProcessId,ProcessId
        const parts = line.trim().split(',');
        if (parts.length >= 3) {
          const parentPid = parseInt(parts[1], 10);
          const pid = parseInt(parts[2], 10);
          if (!isNaN(pid) && !isNaN(parentPid) && pid > 0) {
            entries.push({ pid, parentPid });
          }
        }
      }

      this.treeCache = { data: entries, timestamp: Date.now() };
      return entries;
    } catch {
      return [];
    }
  }

  /** netstat로 LISTENING 포트 조회 */
  private async getListeningPorts(): Promise<PortInfo[]> {
    if (this.portCache && Date.now() - this.portCache.timestamp < this.PORT_CACHE_TTL) {
      return this.portCache.data;
    }

    try {
      const { stdout } = await execAsync(
        'netstat -ano -p TCP | findstr LISTENING',
        { timeout: 5000 }
      );

      const ports: PortInfo[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const address = parts[1];
          const portStr = address.split(':').pop();
          const pidStr = parts[4];

          if (portStr && pidStr) {
            const port = parseInt(portStr, 10);
            const pid = parseInt(pidStr, 10);
            // 개발 서버 포트 범위만 (1024~65535)
            if (!isNaN(port) && !isNaN(pid) && port >= 1024) {
              ports.push({ port, pid });
            }
          }
        }
      }

      // 중복 제거
      const unique = Array.from(
        new Map(ports.map(p => [`${p.port}-${p.pid}`, p])).values()
      );

      this.portCache = { data: unique, timestamp: Date.now() };
      return unique;
    } catch {
      return [];
    }
  }
}
