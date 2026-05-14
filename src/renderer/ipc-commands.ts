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
import { pasteTextToPanel } from './terminal';
import { setPendingInput } from './pending-input';
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
      case 'send':
        if (params?.panelId && params?.text) {
          const instance = state.terminalInstances.get(params.panelId as string);
          if (instance) {
            electronAPI.send('terminal:input', { id: params.panelId, data: params.text });
          }
        }
        break;

      // 외부 도구(Claude Code 등)가 포커스된 터미널의 입력창에 "다음 실행 제안"을 등록한다.
      // 기본 동작은 PTY에 즉시 쓰지 않고 제안으로만 보관:
      //   - 사용자가 Enter → 그대로 실행
      //   - 사용자가 타자 → 제안 폐기, 친 글자만 남음
      //   - 사용자가 화살표/Home/End → 제안을 입력창에 커밋해 편집 가능
      // execute:true 이면 확인 없이 즉시 paste + Enter (자동화 시나리오).
      // paste:true 이면 즉시 paste만(실행 X) — 기존 동작 유지가 필요할 때.
      case 'send-input': {
        const text = (params?.text as string | undefined) || '';
        const execute = params?.execute === true;
        const pasteNow = params?.paste === true;
        const targetId = (params?.panelId as string | undefined) || state.focusedPanelId || undefined;
        if (!text || !targetId) break;
        const instance = state.terminalInstances.get(targetId);
        if (!instance) break;

        if (execute) {
          pasteTextToPanel(targetId, `${text}\r`);
        } else if (pasteNow) {
          pasteTextToPanel(targetId, text);
        } else {
          setPendingInput(targetId, text);
        }
        instance.terminal.focus();
        break;
      }
    }
  });
}

export function cleanupIpcCommands(): void {
  removeIpcCommand?.();
  removeIpcCommand = null;
}
