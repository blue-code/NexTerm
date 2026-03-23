import { app, BrowserWindow, dialog, ipcMain, Notification, screen, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

// Windows 콘솔 한글 출력을 위해 코드페이지를 UTF-8(65001)로 변경
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore' }); } catch {}
}

// 프로덕션/개발 환경 경로 해결
// 개발: __dirname = <project>/dist/main/
// 프로덕션: __dirname = <app>/resources/app.asar/dist/main/
const isDev = !app.isPackaged;
const appRoot = path.join(__dirname, '../..');
import { TerminalService } from './services/terminal-service';
import { GitService } from './services/git-service';
import { PortScannerService } from './services/port-scanner-service';
import { SessionService } from './services/session-service';
import { AgentDetectService } from './services/agent-detect-service';
import { BrowserHistoryService } from './services/browser-history-service';
import { AuthService } from './services/auth-service';
import { WindowManagerService } from './services/window-manager-service';
import { IpcPipeServer } from './ipc/pipe-server';
import { initFileLogging, createLogger, setLogLevel } from './services/logger';
import {
  IPC_CHANNELS,
  WorkspaceState,
  SplitLeaf,
  AppSettings,
} from '../shared/types';

// 싱글 인스턴스 보장
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// 로거 초기화
initFileLogging();
if (process.argv.includes('--dev')) {
  setLogLevel('debug');
}
const log = createLogger('main');

const windowManager = new WindowManagerService();
const terminalService = new TerminalService();
const gitService = new GitService();
const portScanner = new PortScannerService();
const sessionService = new SessionService();
const agentDetectService = new AgentDetectService();
const browserHistoryService = new BrowserHistoryService();
const authService = new AuthService();
let pipeServer: IpcPipeServer | null = null;
let sessionSaveInterval: ReturnType<typeof setInterval> | null = null;

// 기본 설정
const defaultSettings: AppSettings = {
  fontFamily: 'Cascadia Code, Consolas, monospace',
  fontSize: 14,
  scrollbackLimit: 10000,
  theme: 'dark',
  backgroundImage: '',
  sidebarWidth: 240,
  unfocusedPanelOpacity: 0.6,
  sessionRestoreEnabled: true,
  socketControlMode: 'nextermOnly',
  defaultShell: 'powershell.exe',
  externalUrlPatterns: [],
  language: 'ko',
};

// 설정 파일 영속화 경로
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(settingsPath)) {
      const json = fs.readFileSync(settingsPath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(json) };
    }
  } catch (err) {
    log.error('설정 로드 실패', err);
  }
  return { ...defaultSettings };
}

function saveSettings(settings: AppSettings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    log.error('설정 저장 실패', err);
  }
}

let currentSettings: AppSettings = loadSettings();

function createWindow(): void {
  // 세션에서 창 크기 복원 시도
  const session = sessionService.load();
  const bounds = session?.windowBounds ?? {
    x: undefined as number | undefined,
    y: undefined as number | undefined,
    width: 1400,
    height: 900,
  };

  windowManager.create({
    appRoot,
    preloadPath: path.join(__dirname, 'preload.js'),
    isDev: process.argv.includes('--dev'),
    bounds,
    backgroundColor: '#1a1b26',
    iconPath: path.join(appRoot, 'assets/icon.png'),
  });

  // 세션 자동 저장 (8초 간격) — 첫 윈도우 생성 시에만 타이머 설정
  if (!sessionSaveInterval) {
    sessionSaveInterval = setInterval(() => {
      const win = windowManager.getFocusedWindow();
      if (win && currentSettings.sessionRestoreEnabled) {
        win.webContents.send('session:request-snapshot');
      }
    }, 8000);
  }
}

// ── IPC 핸들러 등록 ──

function setupIpcHandlers(): void {
  // 타이틀바 윈도우 컨트롤
  // 타이틀바 윈도우 컨트롤 — 요청을 보낸 윈도우를 대상으로 처리
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  // 터미널 생성
  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, (_event, opts: { id: string; cwd?: string; shell?: string; shellCommand?: string }) => {
    const shellPath = opts.shell || process.env.COMSPEC || 'cmd.exe';
    // cwd가 유효하지 않으면 홈 디렉토리로 폴백 (에러 코드 267 방지)
    const requestedCwd = opts.cwd || process.env.USERPROFILE || 'C:\\';
    const cwd = (requestedCwd && fs.existsSync(requestedCwd) && fs.statSync(requestedCwd).isDirectory())
      ? requestedCwd
      : (process.env.USERPROFILE || 'C:\\');
    terminalService.create(opts.id, shellPath, cwd);

    // 감지된 명령줄이 있으면 터미널에 자동 입력 (start 명령 가로채기)
    if (opts.shellCommand) {
      // 명령줄에서 실행할 부분 추출: "cmd /k ..." → /k 이후 명령
      const cmdMatch = opts.shellCommand.match(/\/[kK]\s+(.+)/);
      if (cmdMatch) {
        setTimeout(() => {
          terminalService.write(opts.id, cmdMatch[1].replace(/^"(.*)"$/, '$1') + '\r');
        }, 500);
      }
    }

    // 터미널 출력 → 렌더러 전달 + AI 에이전트 감지
    terminalService.onData(opts.id, (data: string) => {
      windowManager.broadcast(IPC_CHANNELS.TERMINAL_DATA, { id: opts.id, data });
      agentDetectService.feed(opts.id, data);
    });

    terminalService.onExit(opts.id, (exitCode: number) => {
      windowManager.broadcast(IPC_CHANNELS.TERMINAL_CLOSE, { id: opts.id, exitCode });
    });

    return { success: true };
  });

  // 터미널 입력
  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, (_event, opts: { id: string; data: string }) => {
    terminalService.write(opts.id, opts.data);
  });

  // 터미널 리사이즈
  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, (_event, opts: { id: string; cols: number; rows: number }) => {
    terminalService.resize(opts.id, opts.cols, opts.rows);
  });

  // 터미널 종료
  ipcMain.on(IPC_CHANNELS.TERMINAL_CLOSE, (_event, opts: { id: string }) => {
    terminalService.destroy(opts.id);
    agentDetectService.removePanel(opts.id);
  });

  // Git 상태 조회
  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_event, opts: { cwd: string }) => {
    return gitService.getStatus(opts.cwd);
  });

  // 터미널 PID 조회 (렌더러에서 포트 스캔용)
  ipcMain.handle('terminal:pid', (_event, opts: { id: string }) => {
    return terminalService.getPid(opts.id) || null;
  });

  // 포트 스캔 (PID 배치 조회)
  ipcMain.handle(IPC_CHANNELS.PORT_SCAN, async (_event, opts: { pids?: number[] }) => {
    if (opts.pids && opts.pids.length > 0) {
      return portScanner.scanByPids(opts.pids);
    }
    return {};
  });

  // 설정 조회/변경
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => currentSettings);

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, partial: Partial<AppSettings>) => {
    currentSettings = { ...currentSettings, ...partial };
    saveSettings(currentSettings);
    windowManager.broadcast('settings:changed', currentSettings);
    return currentSettings;
  });

  // 파일 선택 다이얼로그 (배경 이미지 등)
  ipcMain.handle('dialog:open-file', async (event, opts: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: opts?.filters,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // 세션 저장 (창 위치/크기를 메인 프로세스에서 주입)
  ipcMain.on(IPC_CHANNELS.SESSION_SAVE, (event, snapshot) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      snapshot.windowBounds = win.getBounds();
    }
    sessionService.save(snapshot);
  });

  // 세션 복원
  ipcMain.handle(IPC_CHANNELS.SESSION_RESTORE, () => {
    return sessionService.load();
  });

  // 외부 링크 열기
  ipcMain.on('shell:open-external', (_event, url: string) => {
    shell.openExternal(url);
  });

  // ── AI 에이전트 감지 ──

  // 에이전트 상태 변경 시 렌더러에 알림 + Toast 표시
  agentDetectService.onStatusChange((panelId, status, agentName) => {
    windowManager.broadcast(IPC_CHANNELS.AGENT_STATUS_CHANGED, {
      panelId, status, agentName,
      completedAt: status === 'completed' ? Date.now() : undefined,
    });

    // 작업 완료 시 Windows Toast 알림
    if (status === 'completed' && agentName) {
      const toast = new Notification({
        title: `${agentName} 작업 완료`,
        body: '에이전트가 작업을 마치고 입력을 기다리고 있습니다.',
        icon: path.join(appRoot, 'assets/icon.png'),
      });
      toast.on('click', () => {
        windowManager.showAndFocus();
      });
      toast.show();
    }
  });

  // 에이전트 전체 상태 조회
  ipcMain.handle(IPC_CHANNELS.AGENT_GET_STATUS, () => {
    const statuses = agentDetectService.getAllStatuses();
    // Map → 직렬화 가능한 객체로 변환
    const result: Record<string, unknown> = {};
    for (const [panelId, info] of statuses) {
      result[panelId] = info;
    }
    return result;
  });

  // ── 브라우저 히스토리 ──

  ipcMain.on(IPC_CHANNELS.BROWSER_HISTORY_ADD, (_event, opts: { url: string; title: string }) => {
    browserHistoryService.add(opts.url, opts.title);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_HISTORY_SEARCH, (_event, opts: { query: string; limit?: number }) => {
    return browserHistoryService.search(opts.query, opts.limit);
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_HISTORY_LIST, (_event, opts?: { limit?: number }) => {
    return browserHistoryService.getRecent(opts?.limit);
  });

  // ── 커스텀 키바인딩 ──

  const keybindingsPath = path.join(app.getPath('userData'), 'keybindings.json');

  ipcMain.handle(IPC_CHANNELS.KEYBINDINGS_GET, () => {
    try {
      if (fs.existsSync(keybindingsPath)) {
        return JSON.parse(fs.readFileSync(keybindingsPath, 'utf-8'));
      }
    } catch {
      // 파싱 실패 시 빈 객체 반환
    }
    return {};
  });

  ipcMain.handle(IPC_CHANNELS.KEYBINDINGS_SET, (_event, bindings: Record<string, string>) => {
    try {
      fs.writeFileSync(keybindingsPath, JSON.stringify(bindings, null, 2), 'utf-8');
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  // ── 파일 읽기/감시 (마크다운 뷰어 등) ──

  const fileWatchers = new Map<string, fs.FSWatcher>();

  ipcMain.handle(IPC_CHANNELS.FILE_READ, (_event, opts: { filePath: string }) => {
    try {
      // UTF-8 우선, 실패 시 latin1 폴백
      return fs.readFileSync(opts.filePath, 'utf-8');
    } catch {
      try {
        return fs.readFileSync(opts.filePath, 'latin1');
      } catch {
        return null;
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILE_WATCH, (_event, opts: { filePath: string; panelId: string }) => {
    const key = opts.panelId;
    // 기존 감시 해제
    fileWatchers.get(key)?.close();

    try {
      const watcher = fs.watch(opts.filePath, (eventType) => {
        if (eventType === 'change') {
          windowManager.broadcast(IPC_CHANNELS.FILE_CHANGED, { panelId: opts.panelId, filePath: opts.filePath });
        }
      });
      fileWatchers.set(key, watcher);
      return { success: true };
    } catch {
      return { success: false };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILE_UNWATCH, (_event, opts: { panelId: string }) => {
    const watcher = fileWatchers.get(opts.panelId);
    if (watcher) {
      watcher.close();
      fileWatchers.delete(opts.panelId);
    }
    return { success: true };
  });
}

// ── Named Pipe IPC 서버 (CLI 제어용) ──

function setupPipeServer(): void {
  pipeServer = new IpcPipeServer();
  pipeServer.setControlMode(currentSettings.socketControlMode);
  pipeServer.setAuthService(authService);

  // password 모드에서 비밀번호가 없으면 자동 생성
  if (currentSettings.socketControlMode === 'password' && !authService.hasPassword()) {
    const pw = authService.generatePassword();
    log.info('소켓 비밀번호 자동 생성:', pw);
  }

  pipeServer.onCommand((method, params) => {
    // CLI 명령을 렌더러에 전달 (포커스된 윈도우)
    windowManager.getFocusedWindow()?.webContents.send('ipc:command', { method, params });

    // 일부 명령은 메인 프로세스에서 직접 처리
    switch (method) {
      case 'focus-window':
        windowManager.showAndFocus();
        return { success: true };
      case 'new-window':
        createWindow();
        return { success: true };
      case 'tree': {
        // 마지막 저장된 세션에서 트리 구조 생성
        const session = sessionService.load();
        if (!session || !session.workspaces) {
          return { tree: '(세션 데이터 없음)' };
        }
        const lines: string[] = ['NexTerm'];
        for (let i = 0; i < session.workspaces.length; i++) {
          const ws = session.workspaces[i];
          const isLast = i === session.workspaces.length - 1;
          const prefix = isLast ? '└─' : '├─';
          const active = ws.id === session.activeWorkspaceId ? ' *' : '';
          lines.push(`${prefix} ${ws.name}${active}`);
          for (let j = 0; j < ws.panels.length; j++) {
            const p = ws.panels[j];
            const pIsLast = j === ws.panels.length - 1;
            const branch = isLast ? '   ' : '│  ';
            const pPrefix = pIsLast ? '└─' : '├─';
            const icon = p.type === 'terminal' ? '▸' : p.type === 'browser' ? '◎' : '¶';
            const detail = p.type === 'terminal' ? (p.cwd || '') : (p.url || p.filePath || '');
            lines.push(`${branch}${pPrefix} ${icon} ${p.type} ${detail}`);
          }
        }
        return { tree: lines.join('\n') };
      }
      default:
        return null; // 렌더러 처리
    }
  });

  pipeServer.start();
}

// ── 앱 라이프사이클 ──

app.whenReady().then(() => {
  terminalService.ensureBinScripts();

  // 자식 프로세스 감시: 배치 파일의 start 명령으로 새 콘솔 창이 생성되면
  // 해당 프로세스를 종료하고 NexTerm 새 패널로 전환
  terminalService.onChildTerminal((commandLine: string) => {
    windowManager.broadcast('terminal:child-detected', { commandLine });
  });

  createWindow();
  setupIpcHandlers();
  setupPipeServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  const win = windowManager.getFocusedWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (sessionSaveInterval) clearInterval(sessionSaveInterval);
  terminalService.destroyAll();
  pipeServer?.stop();
  app.quit();
});

app.on('before-quit', () => {
  // 세션 저장 후 정리
  terminalService.destroyAll();
  pipeServer?.stop();
});

// ── 보안: webview 및 새 창 제어 ──

app.on('web-contents-created', (_event, contents) => {
  // webview 내부에서 Node.js 접근 차단
  contents.on('will-attach-webview' as any, (_waEvent: any, webPreferences: any, _params: any) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });

  // 외부 링크는 시스템 기본 브라우저로 열기 (앱 내 새 창 생성 차단)
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' as const };
  });
});
