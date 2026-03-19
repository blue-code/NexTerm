/**
 * 리스닝 포트 스캐너
 * Windows에서 netstat를 사용하여 터미널 프로세스의 리스닝 포트를 감지한다.
 * cmux 원본의 ps+lsof 조합을 netstat로 대체한다.
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PortInfo {
  port: number;
  pid: number;
  state: string;
}

export class PortScannerService {
  // 캐시 (2초 TTL, 빠른 갱신)
  private cache: { data: PortInfo[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 2000;

  /**
   * 특정 PID의 리스닝 포트 조회
   * PID 미지정 시 전체 리스닝 포트 반환
   */
  async scan(pid?: number): Promise<number[]> {
    const allPorts = await this.getAllListeningPorts();

    if (pid) {
      return allPorts
        .filter(p => p.pid === pid)
        .map(p => p.port);
    }

    return allPorts.map(p => p.port);
  }

  private async getAllListeningPorts(): Promise<PortInfo[]> {
    if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_TTL) {
      return this.cache.data;
    }

    try {
      // netstat로 LISTENING 상태 TCP 포트 조회
      const { stdout } = await execAsync(
        'netstat -ano -p TCP | findstr LISTENING',
        { timeout: 5000 }
      );

      const ports: PortInfo[] = [];
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        // 형식: TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    12345
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const address = parts[1];
          const portStr = address.split(':').pop();
          const pidStr = parts[4];

          if (portStr && pidStr) {
            const port = parseInt(portStr, 10);
            const pid = parseInt(pidStr, 10);
            if (!isNaN(port) && !isNaN(pid) && port > 0) {
              // 시스템 포트(1024 미만) 제외, 개발 서버 포트만 표시
              if (port >= 1024) {
                ports.push({ port, pid, state: 'LISTENING' });
              }
            }
          }
        }
      }

      // 중복 제거
      const unique = Array.from(
        new Map(ports.map(p => [`${p.port}-${p.pid}`, p])).values()
      );

      this.cache = { data: unique, timestamp: Date.now() };
      return unique;
    } catch {
      return [];
    }
  }
}
