import { app, BrowserWindow, dialog, ipcMain, Notification, screen, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// 프로덕션/개발 환경 경로 해결
// 개발: __dirname = <project>/dist/main/
// 프로덕션: __dirname = <app>/resources/app.asar/dist/main/
const isDev = !app.isPackaged;
const appRoot = path.join(__dirname, '../..');
import { TerminalService } from './services/terminal-service';
import { GitService } from './services/git-service';
import { PortScannerService } from './services/port-scanner-service';
import { SessionService } from './services/session-service';
import { IpcPipeServer } from './ipc/pipe-server';
import {
  IPC_CHANNELS,
  WorkspaceState,
  SplitLeaf,
  AppNotification,
  AppSettings,
} from '../shared/types';

// 싱글 인스턴스 보장
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const terminalService = new TerminalService();
const gitService = new GitService();
const portScanner = new PortScannerService();
const sessionService = new SessionService();
let pipeServer: IpcPipeServer | null = null;

// 기본 설정
const defaultSettings: AppSettings = {
  fontFamily: 'Cascadia Code, Consolas, monospace',
  fontSize: 14,
  scrollbackLimit: 10000,
  theme: 'dark',
  backgroundImage: '',
  sidebarWidth: 240,
  unfocusedPanelOpacity: 0.6,
  notificationSound: true,
  sessionRestoreEnabled: true,
  socketControlMode: 'nextermOnly',
  defaultShell: 'powershell.exe',
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
    console.error('설정 로드 실패:', err);
  }
  return { ...defaultSettings };
}

function saveSettings(settings: AppSettings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('설정 저장 실패:', err);
  }
}

let currentSettings: AppSettings = loadSettings();

function createWindow(): void {
  // 세션에서 창 크기 복원 시도
  const session = sessionService.load();
  let bounds = session?.windowBounds ?? {
    x: undefined as number | undefined,
    y: undefined as number | undefined,
    width: 1400,
    height: 900,
  };

  // 저장된 좌표가 현재 모니터 범위 밖이면 기본값으로 폴백
  if (bounds.x !== undefined && bounds.y !== undefined) {
    const displays = screen.getAllDisplays();
    const inBounds = displays.some(display => {
      const { x, y, width, height } = display.bounds;
      return bounds.x! >= x - 100 && bounds.x! < x + width + 100 &&
             bounds.y! >= y - 100 && bounds.y! < y + height + 100;
    });
    if (!inBounds) {
      bounds = { x: undefined, y: undefined, width: bounds.width || 1400, height: bounds.height || 900 };
    }
  }

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    title: 'NexTerm',
    // 커스텀 타이틀바 사용
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1b26',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // 브라우저 패널용 webview 허용
      webviewTag: true,
    },
    icon: path.join(appRoot, 'assets/icon.png'),
  });

  mainWindow.loadFile(path.join(appRoot, 'src/renderer/index.html'));

  // 개발 모드에서 DevTools 열기
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 세션 자동 저장 (8초 간격)
  setInterval(() => {
    if (mainWindow && currentSettings.sessionRestoreEnabled) {
      mainWindow.webContents.send('session:request-snapshot');
    }
  }, 8000);
}

// ── IPC 핸들러 등록 ──

function setupIpcHandlers(): void {
  // 타이틀바 윈도우 컨트롤
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());
  // 터미널 생성
  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, (_event, opts: { id: string; cwd?: string; shell?: string }) => {
    const shellPath = opts.shell || process.env.COMSPEC || 'cmd.exe';
    // cwd가 유효하지 않으면 홈 디렉토리로 폴백 (에러 코드 267 방지)
    const requestedCwd = opts.cwd || process.env.USERPROFILE || 'C:\\';
    const cwd = (requestedCwd && fs.existsSync(requestedCwd) && fs.statSync(requestedCwd).isDirectory())
      ? requestedCwd
      : (process.env.USERPROFILE || 'C:\\');
    terminalService.create(opts.id, shellPath, cwd);

    // 터미널 출력 → 렌더러 전달
    terminalService.onData(opts.id, (data: string) => {
      mainWindow?.webContents.send(IPC_CHANNELS.TERMINAL_DATA, { id: opts.id, data });
    });

    terminalService.onExit(opts.id, (exitCode: number) => {
      mainWindow?.webContents.send(IPC_CHANNELS.TERMINAL_CLOSE, { id: opts.id, exitCode });
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

  // 알림 발송 (Windows Toast)
  ipcMain.on(IPC_CHANNELS.NOTIFICATION_SEND, (_event, notif: AppNotification) => {
    if (currentSettings.notificationSound) {
      // 시스템 알림 표시
      const toast = new Notification({
        title: notif.title,
        body: notif.body,
        icon: path.join(appRoot, 'assets/icon.png'),
      });
      toast.on('click', () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('notification:clicked', notif);
      });
      toast.show();
    }
  });

  // 설정 조회/변경
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => currentSettings);

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, partial: Partial<AppSettings>) => {
    currentSettings = { ...currentSettings, ...partial };
    saveSettings(currentSettings);
    mainWindow?.webContents.send('settings:changed', currentSettings);
    return currentSettings;
  });

  // 파일 선택 다이얼로그 (배경 이미지 등)
  ipcMain.handle('dialog:open-file', async (_event, opts: { filters?: Array<{ name: string; extensions: string[] }> }) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: opts?.filters,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // 세션 저장 (창 위치/크기를 메인 프로세스에서 주입)
  ipcMain.on(IPC_CHANNELS.SESSION_SAVE, (_event, snapshot) => {
    if (mainWindow) {
      snapshot.windowBounds = mainWindow.getBounds();
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
}

// ── Named Pipe IPC 서버 (CLI 제어용) ──

function setupPipeServer(): void {
  pipeServer = new IpcPipeServer();

  pipeServer.onCommand((method, params) => {
    // CLI 명령을 렌더러에 전달
    mainWindow?.webContents.send('ipc:command', { method, params });

    // 일부 명령은 메인 프로세스에서 직접 처리
    switch (method) {
      case 'focus-window':
        mainWindow?.show();
        mainWindow?.focus();
        return { success: true };
      case 'new-window':
        createWindow();
        return { success: true };
      default:
        return null; // 렌더러 처리
    }
  });

  pipeServer.start();
}

// ── 앱 라이프사이클 ──

app.whenReady().then(() => {
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
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
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
