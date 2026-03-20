/**
 * CLI Named Pipe → 렌더러 IPC 명령 수신 처리
 */
import { state, electronAPI } from './state';
import {
  createWorkspace,
  selectWorkspace,
  renameWorkspace,
  splitPanel,
  openBrowserPanel,
} from './workspace';
import { addNotification } from './notifications';
import type { IpcCommandPayload } from '../../shared/types';

let removeIpcCommand: (() => void) | null = null;

/** CLI IPC 명령 리스너 등록 */
export function initIpcCommands(): void {
  removeIpcCommand = electronAPI.on('ipc:command', (payload: unknown) => {
    const { method, params } = payload as IpcCommandPayload;
    switch (method) {
      case 'new-workspace':
        createWorkspace(params?.name as string | undefined, params?.cwd as string | undefined);
        break;
      case 'select-workspace':
        if (params?.id) selectWorkspace(params.id as string);
        break;
      case 'rename-workspace':
        if (params?.id && params?.name) renameWorkspace(params.id as string, params.name as string);
        break;
      case 'new-split':
        splitPanel((params?.direction as 'horizontal' | 'vertical') || 'horizontal', {
          cwd: params?.cwd as string | undefined,
          shell: params?.shell as string | undefined,
        });
        break;
      case 'open-browser':
        openBrowserPanel(params?.url as string | undefined);
        break;
      case 'notify':
        addNotification(
          (params?.title as string) || 'NexTerm',
          (params?.body as string) || '',
          params?.workspaceId as string | undefined,
          params?.panelId as string | undefined,
        );
        break;
      case 'send':
        if (params?.panelId && params?.text) {
          const instance = state.terminalInstances.get(params.panelId as string);
          if (instance) {
            electronAPI.send('terminal:input', { id: params.panelId, data: params.text });
          }
        }
        break;
    }
  });
}

export function cleanupIpcCommands(): void {
  removeIpcCommand?.();
  removeIpcCommand = null;
}
