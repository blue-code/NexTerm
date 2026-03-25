/**
 * ConPTY 기반 터미널 프로세스 관리
 * node-pty를 래핑하여 여러 터미널 인스턴스를 관리한다.
 */
import * as pty from 'node-pty';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import { app } from 'electron';

interface TerminalInstance {
  process: pty.IPty;
  dataListeners: Array<(data: string) => void>;
  exitListeners: Array<(code: number) => void>;
}

// 자식 프로세스 감지 콜백: 새 콘솔 창으로 생성된 터미널 프로세스를 가로챌 때 호출
type ChildProcessHandler = (commandLine: string, cwd: string) => void;

export class TerminalService {
  private terminals = new Map<string, TerminalInstance>();
  private childMonitors = new Map<string, NodeJS.Timeout>();
  private onChildTerminalDetected: ChildProcessHandler | null = null;
  private binDir: string = '';

  /**
   * NexTerm CLI 헬퍼 스크립트 생성 (nt.cmd, nexterm-start.cmd)
   * cmd.exe에서 새 패널을 열 수 있도록 nt 명령어와 start 래퍼를 제공한다.
   */
  ensureBinScripts(): void {
    this.binDir = path.join(app.getPath('userData'), 'bin');
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }

    // nt.cmd — Named Pipe로 NexTerm에 새 패널 생성 요청 (cmd.exe용)
    const ntCmd = [
      '@echo off',
      'setlocal',
      'set "_shell=%~1"',
      'set "_cwd=%cd%"',
      // PowerShell로 Named Pipe 전송 (cmd.exe에는 파이프 클라이언트 없음)
      'powershell -NoProfile -NoLogo -Command "' +
        '$bs=[char]92;' +
        "$cwd='%_cwd%'.Replace($bs,\\\"$bs$bs\\\");" +
        "$sh='%_shell%'.Replace($bs,\\\"$bs$bs\\\");" +
        "$body='{\\\"id\\\":\\\"1\\\",\\\"method\\\":\\\"new-split\\\",\\\"params\\\":{\\\"cwd\\\":\\\"'+$cwd+'\\\",\\\"shell\\\":\\\"'+$sh+'\\\"}}';"+
        "$pipe=[IO.Pipes.NamedPipeClientStream]::new('.','nexterm-ipc','InOut');" +
        'try{$pipe.Connect(2000)}catch{Write-Host NexTerm pipe failed;exit 1};' +
        '$w=[IO.StreamWriter]::new($pipe);$w.WriteLine($body);$w.Flush();' +
        'Start-Sleep -Milliseconds 200;$pipe.Close()"',
      'endlocal',
    ].join('\r\n');
    fs.writeFileSync(path.join(this.binDir, 'nt.cmd'), ntCmd, 'utf-8');

    // nexterm-start.cmd — start 명령 래퍼 (DOSKEY에서 호출)
    // 터미널 프로그램이면 nt로 리다이렉트, 아니면 원래 start 실행
    const startCmd = [
      '@echo off',
      'setlocal enabledelayedexpansion',
      // 첫 번째 인자가 따옴표로 시작하면 타이틀 → 건너뜀
      'set "_title="',
      'set "_arg1=%~1"',
      'set "_first_char=%_arg1:~0,1%"',
      // shift로 타이틀 건너뛰기
      'set "_prog=%~1"',
      'shift',
      // 프로그램이 터미널인지 확인
      'for %%T in (cmd cmd.exe powershell powershell.exe pwsh pwsh.exe bash bash.exe wt wt.exe) do (',
      '  if /I "!_prog!"=="%%T" (',
      '    call nt.cmd "!_prog!"',
      '    endlocal',
      '    exit /b 0',
      '  )',
      ')',
      // 터미널이 아니면 원래 start 실행 (cmd /c로 내장 start 호출)
      'cmd /c start "" %_prog% %1 %2 %3 %4 %5 %6 %7 %8 %9',
      'endlocal',
    ].join('\r\n');
    fs.writeFileSync(path.join(this.binDir, 'nexterm-start.cmd'), startCmd, 'utf-8');
  }

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
    // Windows 레지스트리에서 최신 PATH를 읽어 기존 PATH와 병합
    // 레지스트리 값으로 완전 교체하면 Git Credential Manager 등 프로세스 환경에만 있는 경로가 누락됨
    env['PATH'] = this.mergeWindowsPath(env['PATH'] || '');
    // NexTerm 환경 변수 주입 (에이전트가 CLI 사용 가능하도록)
    env['NEXTERM_PIPE'] = '\\\\.\\pipe\\nexterm-ipc';
    env['NEXTERM_PANEL_ID'] = id;
    env['TERM_PROGRAM'] = 'nexterm';
    // nt.cmd 등 헬퍼 스크립트를 PATH 선두에 추가
    if (this.binDir) {
      env['PATH'] = this.binDir + ';' + env['PATH'];
    }

    // PowerShell인 경우 프롬프트에 OSC 2 시퀀스 주입 (CWD 실시간 추적용)
    const spawnArgs = this.buildShellArgs(resolvedShell);

    const ptyProcess = pty.spawn(resolvedShell, spawnArgs, {
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

    // 자식 프로세스 감시 시작 (배치 파일의 start 명령 가로채기)
    const pid = ptyProcess.pid;
    if (pid) {
      this.startChildMonitor(id, pid);
    }
  }

  /**
   * 자식 프로세스 감시 콜백 등록
   * 배치 파일의 `start cmd /k ...` 등으로 새 콘솔 창이 생성되면 호출된다.
   */
  onChildTerminal(handler: ChildProcessHandler): void {
    this.onChildTerminalDetected = handler;
  }

  /**
   * 자식 프로세스 감시: 터미널 PID의 자식 중 새 콘솔 프로세스를 감지하여 가로챈다.
   * start 명령이 CREATE_NEW_CONSOLE로 생성한 cmd.exe/powershell.exe를 포착한다.
   */
  private startChildMonitor(terminalId: string, parentPid: number): void {
    const knownPids = new Set<number>();
    const terminalNames = new Set(['cmd.exe', 'powershell.exe', 'pwsh.exe']);

    // 감시 대상 프로세스의 전체 자손 트리에서 새로운 터미널 프로세스를 찾는다
    const psCommand = `Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq ${parentPid} -and $_.ProcessId -ne ${parentPid}} | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress`;

    const interval = setInterval(() => {
      if (!this.terminals.has(terminalId)) {
        clearInterval(interval);
        this.childMonitors.delete(terminalId);
        return;
      }

      try {
        exec(`powershell -NoProfile -Command "${psCommand}"`, { timeout: 3000 }, (err, stdout) => {
          if (err || !stdout.trim()) return;
          try {
            let processes = JSON.parse(stdout.trim());
            if (!Array.isArray(processes)) processes = [processes];

            for (const proc of processes) {
              const pid = proc.ProcessId;
              const name = (proc.Name || '').toLowerCase();
              const cmdLine = proc.CommandLine || '';

              // 이미 알고 있는 PID는 무시
              if (knownPids.has(pid)) continue;
              knownPids.add(pid);

              // 터미널 프로그램이 아니면 무시
              if (!terminalNames.has(name)) continue;

              // ConPTY 자체 프로세스는 무시 (셸 자신)
              if (cmdLine === '' || /\\\\\\?\\/.test(cmdLine)) continue;

              // cmd /c는 배치 파일 실행이므로 무시 (새 터미널 창이 아님)
              // cmd /k만 가로채기 (start 명령으로 새 콘솔 창을 만든 경우)
              if (name === 'cmd.exe' && !/\/[kK]\s/.test(cmdLine)) continue;
              // powershell -Command 등 새 셸 인스턴스만 가로채기
              if ((name === 'powershell.exe' || name === 'pwsh.exe') && !/-Command\s/.test(cmdLine)) continue;

              // 새 콘솔 프로세스 감지 → 종료 후 새 패널로 전환
              try {
                process.kill(pid);
              } catch {
                // 이미 종료된 경우 무시
              }

            if (this.onChildTerminalDetected) {
              this.onChildTerminalDetected(cmdLine, '');
            }
          }
        } catch {
          // JSON 파싱 실패 무시
        }
        });
      } catch {
        // spawn 실패 시 무시 (시스템 리소스 부족 등)
      }
    }, 800);

    this.childMonitors.set(terminalId, interval);
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
    // 자식 프로세스 감시 정리
    const monitor = this.childMonitors.get(id);
    if (monitor) {
      clearInterval(monitor);
      this.childMonitors.delete(id);
    }

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

  /**
   * 셸 유형별 시작 인자 생성
   * PowerShell: 프롬프트, nt(새 터미널 패널), start 래퍼 함수 주입
   * cmd.exe: 기본적으로 타이틀에 경로를 표시하므로 추가 설정 불필요
   */
  private buildShellArgs(shell: string): string[] {
    if (/powershell|pwsh/i.test(shell)) {
      // OSC 2 시퀀스: \e]2;{path}\a → xterm.js onTitleChange로 전달
      const promptFn = [
        'function prompt {',
        '  $e=[char]27; $a=[char]7;',
        '  $p=(Get-Location).Path;',
        '  Write-Host -NoNewline ("$e]2;$p$a");',
        '  return "PS $p> "',
        '}',
      ].join(' ');

      // nt (new terminal): Named Pipe로 NexTerm에 새 터미널 패널 생성 요청
      // [char]92 = 백슬래시, JSON 이스케이프용
      const ntFn = [
        'function nt([string]$Shell) {',
        '  $bs=[char]92;',
        '  $cwd=(Get-Location).Path.Replace($bs,"$bs$bs");',
        '  $sh=if($Shell){$Shell.Replace($bs,"$bs$bs")}else{""};',
        "  $body='{\"id\":\"1\",\"method\":\"new-split\",\"params\":{\"cwd\":\"'+$cwd+'\",\"shell\":\"'+$sh+'\"}}';",
        "  $pipe=[System.IO.Pipes.NamedPipeClientStream]::new('.','nexterm-ipc','InOut');",
        "  try{$pipe.Connect(2000)}catch{Write-Host 'NexTerm 파이프 연결 실패';return};",
        '  $w=[System.IO.StreamWriter]::new($pipe);',
        '  $w.WriteLine($body);$w.Flush();',
        '  Start-Sleep -Milliseconds 200;',
        '  $pipe.Close()',
        '}',
      ].join(' ');

      // start 래퍼: 터미널 프로그램(cmd, powershell 등) 실행 시 새 패널로 리다이렉트
      const startWrapper = [
        'if(Get-Command Remove-Alias -ErrorAction SilentlyContinue){Remove-Alias start -Force -ErrorAction SilentlyContinue};',
        'function start {',
        '  param([Parameter(Position=0)][string]$FilePath,',
        '    [Parameter(ValueFromRemainingArguments)][object[]]$Remaining)',
        "  $terms=@('cmd','cmd.exe','powershell','powershell.exe','pwsh','pwsh.exe','bash','bash.exe','wt','wt.exe');",
        '  if($terms -contains [IO.Path]::GetFileName($FilePath).ToLower()){nt $FilePath}',
        '  else{Start-Process $FilePath @Remaining}',
        '}',
      ].join(' ');

      return ['-NoLogo', '-NoExit', '-Command', `${promptFn} ${ntFn} ${startWrapper}`];
    }

    // cmd.exe: DOSKEY로 start 명령 래퍼 설정 (대화형 세션에서 동작)
    if (/cmd\.exe$/i.test(shell) || /cmd$/i.test(shell)) {
      return ['/k', 'doskey start=nexterm-start.cmd $*'];
    }

    return [];
  }

  /**
   * Windows 레지스트리에서 최신 PATH를 읽고 기존 프로세스 PATH와 병합
   * 레지스트리에 새로 추가된 경로를 반영하면서, 프로세스 환경에만 존재하는
   * 경로(Git mingw64/bin 등)도 유지한다.
   */
  private mergeWindowsPath(currentPath: string): string {
    try {
      const systemPath = execSync(
        'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path',
        { encoding: 'utf-8', timeout: 3000 },
      ).replace(/[\r\n]+/g, ' ').replace(/.*REG_(?:SZ|EXPAND_SZ)\s+/i, '').trim();

      const userPath = execSync(
        'reg query "HKCU\\Environment" /v Path',
        { encoding: 'utf-8', timeout: 3000 },
      ).replace(/[\r\n]+/g, ' ').replace(/.*REG_(?:SZ|EXPAND_SZ)\s+/i, '').trim();

      // 레지스트리 PATH를 기준으로, 기존 프로세스 PATH에만 있는 경로를 뒤에 추가
      const registryPath = `${userPath};${systemPath}`;
      const registrySet = new Set(
        registryPath.split(';').map(p => p.toLowerCase().replace(/\\+$/, '')).filter(Boolean),
      );

      const extraPaths = currentPath
        .split(';')
        .filter(p => p && !registrySet.has(p.toLowerCase().replace(/\\+$/, '')));

      return extraPaths.length > 0
        ? `${registryPath};${extraPaths.join(';')}`
        : registryPath;
    } catch {
      return currentPath || process.env.PATH || '';
    }
  }

  /** Windows에서 사용 가능한 셸 경로 결정 */
  private resolveShell(requested: string): string {
    // 이름만 지정된 경우 (powershell.exe 등) PATH에서 찾도록 그대로 반환
    if (!requested.includes('\\') && !requested.includes('/')) {
      return requested;
    }

    // 전체 경로가 존재하면 그대로 사용
    if (fs.existsSync(requested)) {
      return requested;
    }

    // 지정된 경로가 없을 때 폴백: PowerShell 7 → Windows PowerShell → cmd.exe
    const fallbacks = [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe',
    ];

    for (const candidate of fallbacks) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return process.env.COMSPEC || 'cmd.exe';
  }
}
