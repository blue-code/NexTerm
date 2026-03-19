/**
 * 리스닝 포트 스캐너 (PID → 자식 프로세스 트리 → 리스닝 포트)
 *
 * 동작 방식:
 *   1. wmic process로 전체 프로세스의 부모-자식 관계 조회
 *   2. 터미널 셸 PID부터 재귀적으로 자식 프로세스 트리 수집
 *   3. netstat로 LISTENING 포트 조회
 *   4. 자식 트리에 속한 PID의 포트만 반환
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

  /**
   * 특정 PID의 자식 프로세스 트리가 열어둔 리스닝 포트만 반환
   */
  async scanByPid(pid: number): Promise<number[]> {
    if (!pid || pid <= 0) return [];

    const [tree, ports] = await Promise.all([
      this.getProcessTree(),
      this.getListeningPorts(),
    ]);

    // PID부터 재귀적으로 자식 프로세스 수집
    const descendants = this.collectDescendants(pid, tree);
    descendants.add(pid);

    // 자식 트리 PID에 해당하는 포트만 필터
    return ports
      .filter(p => descendants.has(p.pid))
      .map(p => p.port);
  }

  /**
   * 여러 PID를 한 번에 조회 (배치 처리, 프로세스 트리/포트는 1회만 조회)
   */
  async scanByPids(pids: number[]): Promise<Record<number, number[]>> {
    if (!pids.length) return {};

    const [tree, ports] = await Promise.all([
      this.getProcessTree(),
      this.getListeningPorts(),
    ]);

    const result: Record<number, number[]> = {};
    for (const pid of pids) {
      if (!pid || pid <= 0) {
        result[pid] = [];
        continue;
      }
      const descendants = this.collectDescendants(pid, tree);
      descendants.add(pid);
      result[pid] = ports
        .filter(p => descendants.has(p.pid))
        .map(p => p.port);
    }
    return result;
  }

  /** PID에서 재귀적으로 모든 자식 PID를 수집 */
  private collectDescendants(pid: number, tree: ProcessEntry[]): Set<number> {
    const result = new Set<number>();
    const queue = [pid];

    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const entry of tree) {
        if (entry.parentPid === current && !result.has(entry.pid)) {
          result.add(entry.pid);
          queue.push(entry.pid);
        }
      }
    }
    return result;
  }

  /** wmic로 전체 프로세스 부모-자식 관계 조회 */
  private async getProcessTree(): Promise<ProcessEntry[]> {
    if (this.treeCache && Date.now() - this.treeCache.timestamp < this.TREE_CACHE_TTL) {
      return this.treeCache.data;
    }

    try {
      // wmic는 Windows 10에서 안정적으로 동작
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
