/**
 * Preload 스크립트 — contextIsolation 브릿지
 * 허용된 IPC 채널만 렌더러에 노출하여 보안을 강화한다.
 */
import { contextBridge, ipcRenderer, clipboard } from 'electron';

// ── 화이트리스트: 허용된 IPC 채널만 통과 ──

const ALLOWED_INVOKE = new Set([
  'terminal:create',
  'terminal:pid',
  'git:status',
  'port:scan',
  'settings:get',
  'settings:set',
  'session:restore',
  'dialog:open-file',
  'agent:get-status',
  'browser:history-search',
  'browser:history-list',
  'file:read',
  'file:watch',
  'file:unwatch',
  'keybindings:get',
  'keybindings:set',
]);

const ALLOWED_SEND = new Set([
  'terminal:input',
  'terminal:resize',
  'terminal:close',
  'notification:send',
  'session:save',
  'window:minimize',
  'window:maximize',
  'window:close',
  'browser:history-add',
]);

const ALLOWED_ON = new Set([
  'terminal:data',
  'terminal:close',
  'terminal:child-detected',
  'session:request-snapshot',
  'ipc:command',
  'notification:clicked',
  'settings:changed',
  'agent:status-changed',
  'file:changed',
]);

// ── contextBridge로 안전한 API만 노출 ──

contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!ALLOWED_INVOKE.has(channel)) {
      return Promise.reject(new Error(`허용되지 않은 invoke 채널: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  send(channel: string, ...args: unknown[]): void {
    if (!ALLOWED_SEND.has(channel)) {
      console.error(`허용되지 않은 send 채널: ${channel}`);
      return;
    }
    ipcRenderer.send(channel, ...args);
  },

  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    if (!ALLOWED_ON.has(channel)) {
      console.error(`허용되지 않은 on 채널: ${channel}`);
      return () => {};
    }
    // IPC 이벤트의 첫 번째 인자(event 객체)를 제거하여 렌더러에 전달
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    // 리스너 해제 함수 반환
    return () => ipcRenderer.removeListener(channel, handler);
  },

  clipboard: {
    readText(): string {
      return clipboard.readText();
    },
    writeText(text: string): void {
      clipboard.writeText(text);
    },
  },

  env: {
    USERPROFILE: process.env.USERPROFILE || 'C:\\',
  },
});
