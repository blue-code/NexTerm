/**
 * ConPTY 기반 터미널 프로세스 관리
 * node-pty를 래핑하여 여러 터미널 인스턴스를 관리한다.
 */
import * as pty from 'node-pty';
import * as os from 'os';

interface TerminalInstance {
  process: pty.IPty;
  dataListeners: Array<(data: string) => void>;
  exitListeners: Array<(code: number) => void>;
}

export class TerminalService {
  private terminals = new Map<string, TerminalInstance>();

  /**
   * 새 터미널 프로세스 생성
   * @param id - 고유 식별자 (패널 ID)
   * @param shell - 셸 경로 (cmd.exe, powershell.exe, bash.exe 등)
   * @param cwd - 작업 디렉토리
   */
  create(id: string, shell: string, cwd: string): void {
    if (this.terminals.has(id)) {
      this.destroy(id);
    }

    // Windows에서 사용 가능한 셸 자동 감지
    const resolvedShell = this.resolveShell(shell);

    const env = { ...process.env } as Record<string, string>;
    // NexTerm 환경 변수 주입 (에이전트가 CLI 사용 가능하도록)
    env['NEXTERM_PIPE'] = '\\\\.\\pipe\\nexterm-ipc';
    env['NEXTERM_PANEL_ID'] = id;
    env['TERM_PROGRAM'] = 'nexterm';

    const ptyProcess = pty.spawn(resolvedShell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env,
      useConpty: true,
    });

    const instance: TerminalInstance = {
      process: ptyProcess,
      dataListeners: [],
      exitListeners: [],
    };

    // 출력 데이터 분배
    ptyProcess.onData((data: string) => {
      for (const listener of instance.dataListeners) {
        listener(data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      for (const listener of instance.exitListeners) {
        listener(exitCode);
      }
      this.terminals.delete(id);
    });

    this.terminals.set(id, instance);
  }

  /** 터미널에 데이터 쓰기 (키 입력) */
  write(id: string, data: string): void {
    this.terminals.get(id)?.process.write(data);
  }

  /** 터미널 크기 변경 */
  resize(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        terminal.process.resize(cols, rows);
      } catch {
        // 이미 종료된 프로세스에 대한 resize 무시
      }
    }
  }

  /** 터미널 출력 리스너 등록 */
  onData(id: string, callback: (data: string) => void): void {
    this.terminals.get(id)?.dataListeners.push(callback);
  }

  /** 터미널 종료 리스너 등록 */
  onExit(id: string, callback: (code: number) => void): void {
    this.terminals.get(id)?.exitListeners.push(callback);
  }

  /** 터미널 프로세스 종료 */
  destroy(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        terminal.process.kill();
      } catch {
        // 이미 종료된 경우 무시
      }
      this.terminals.delete(id);
    }
  }

  /** 전체 터미널 정리 */
  destroyAll(): void {
    for (const [id] of this.terminals) {
      this.destroy(id);
    }
  }

  /** 프로세스 PID 조회 (포트 스캐닝용) */
  getPid(id: string): number | undefined {
    return this.terminals.get(id)?.process.pid;
  }

  /** Windows에서 사용 가능한 셸 경로 결정 */
  private resolveShell(requested: string): string {
    // PowerShell 7 우선, 없으면 Windows PowerShell, 최종 cmd.exe
    const candidates = [
      requested,
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe',
    ];

    // 요청된 셸이 특정 경로가 아닌 경우 그대로 반환 (PATH에서 찾도록)
    if (!requested.includes('\\') && !requested.includes('/')) {
      return requested;
    }

    return requested;
  }
}
