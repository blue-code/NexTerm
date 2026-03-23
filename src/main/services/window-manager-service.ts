/**
 * 다중 윈도우 관리 서비스
 * mainWindow 단일 변수를 대체하여 여러 BrowserWindow를 관리한다.
 * 각 윈도우는 독립적인 워크스페이스 세트를 보유한다.
 */
import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';

export interface WindowCreateOptions {
  appRoot: string;
  preloadPath: string;
  isDev: boolean;
  bounds?: { x?: number; y?: number; width: number; height: number };
  backgroundColor?: string;
  iconPath?: string;
}

export class WindowManagerService {
  private windows = new Map<string, BrowserWindow>();
  private focusedWindowId: string | null = null;

  /** 새 윈도우 생성 */
  create(opts: WindowCreateOptions): { id: string; window: BrowserWindow } {
    const id = crypto.randomBytes(4).toString('hex');

    let bounds = opts.bounds ?? { x: undefined as number | undefined, y: undefined as number | undefined, width: 1400, height: 900 };

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

    const win = new BrowserWindow({
      ...bounds,
      minWidth: 800,
      minHeight: 600,
      title: 'NexTerm',
      frame: false,
      titleBarStyle: 'hidden',
      backgroundColor: opts.backgroundColor || '#1a1b26',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: opts.preloadPath,
        webviewTag: true,
      },
      icon: opts.iconPath,
    });

    win.loadFile(path.join(opts.appRoot, 'src/renderer/index.html'));

    if (opts.isDev) {
      win.webContents.openDevTools({ mode: 'detach' });
    }

    win.on('closed', () => {
      this.windows.delete(id);
      if (this.focusedWindowId === id) {
        // 다음 윈도우로 포커스 이동
        const remaining = this.windows.keys().next();
        this.focusedWindowId = remaining.done ? null : remaining.value;
      }
    });

    win.on('focus', () => {
      this.focusedWindowId = id;
    });

    this.windows.set(id, win);
    this.focusedWindowId = id;
    return { id, window: win };
  }

  /** 현재 포커스된 윈도우 반환 (없으면 첫 번째 윈도우) */
  getFocusedWindow(): BrowserWindow | null {
    if (this.focusedWindowId) {
      return this.windows.get(this.focusedWindowId) || null;
    }
    const first = this.windows.values().next();
    return first.done ? null : first.value;
  }

  /** 모든 윈도우에 IPC 메시지 브로드캐스트 */
  broadcast(channel: string, ...args: unknown[]): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    }
  }

  /** 특정 윈도우에 IPC 메시지 전송 */
  sendTo(windowId: string, channel: string, ...args: unknown[]): void {
    const win = this.windows.get(windowId);
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  }

  /** 모든 윈도우 목록 */
  getAll(): Map<string, BrowserWindow> {
    return this.windows;
  }

  /** 윈도우 개수 */
  get count(): number {
    return this.windows.size;
  }

  /** ID로 윈도우 조회 */
  get(id: string): BrowserWindow | undefined {
    return this.windows.get(id);
  }

  /** 포커스된 윈도우를 전면으로 */
  showAndFocus(): void {
    const win = this.getFocusedWindow();
    if (win) {
      win.show();
      win.focus();
    }
  }

  /** webContents ID로 윈도우 ID 찾기 */
  findIdByWebContents(webContentsId: number): string | null {
    for (const [id, win] of this.windows) {
      if (!win.isDestroyed() && win.webContents.id === webContentsId) {
        return id;
      }
    }
    return null;
  }
}
