/**
 * Git 상태 + 포트 스캔 폴링
 * 포커스 상태에 따라 동적 간격 조절
 */
import { state, electronAPI, triggerSidebarRender } from './state';
import { createLogger } from './logger';
import type { PanelState, GitStatusResult } from '../../shared/types';

const log = createLogger('polling');

let isFocused = true;

const INTERVALS = {
  git:  { active: 10_000, inactive: 30_000 },
  port: { active: 5_000,  inactive: 15_000 },
};

function getInterval(type: 'git' | 'port'): number {
  return isFocused ? INTERVALS[type].active : INTERVALS[type].inactive;
}

async function pollGitStatus(): Promise<void> {
  for (const ws of state.workspaces) {
    if (!ws.cwd) continue;
    try {
      const status = await electronAPI.invoke('git:status', { cwd: ws.cwd }) as GitStatusResult | null;
      if (status) {
        ws.gitBranch = status.branch;
        ws.gitDirty = status.dirty;
        ws.prNumber = status.prNumber;
      }
    } catch (err) {
      log.debug('Git 상태 조회 실패', err);
    }
  }
  triggerSidebarRender();
}

async function pollPorts(): Promise<void> {
  try {
    const pidMap = new Map<number, string[]>();
    const allPids: number[] = [];

    for (const ws of state.workspaces) {
      for (const panel of ws.panels) {
        if (panel.type === 'terminal') {
          const pid = await electronAPI.invoke('terminal:pid', { id: panel.id }) as number | null;
          if (pid) {
            allPids.push(pid);
            if (!pidMap.has(pid)) pidMap.set(pid, []);
            pidMap.get(pid)!.push(ws.id);
          }
        }
      }
    }

    if (allPids.length === 0) return;

    const portsByPid = await electronAPI.invoke('port:scan', { pids: allPids }) as Record<string, number[]> | null;
    if (!portsByPid) return;

    const portsByWs = new Map<string, Set<number>>();
    for (const [pidStr, ports] of Object.entries(portsByPid)) {
      const pid = parseInt(pidStr, 10);
      const wsIds = pidMap.get(pid) || [];
      for (const wsId of wsIds) {
        if (!portsByWs.has(wsId)) portsByWs.set(wsId, new Set());
        for (const port of ports) {
          portsByWs.get(wsId)!.add(port);
        }
      }
    }

    let changed = false;
    for (const ws of state.workspaces) {
      const newPorts = portsByWs.has(ws.id)
        ? Array.from(portsByWs.get(ws.id)!).sort((a, b) => a - b)
        : [];
      const oldKey = ws.listeningPorts.join(',');
      const newKey = newPorts.join(',');
      if (oldKey !== newKey) {
        ws.listeningPorts = newPorts;
        changed = true;
      }
    }

    if (changed) triggerSidebarRender();
  } catch (err) {
    log.debug('포트 스캔 실패', err);
  }
}

let gitTimer: ReturnType<typeof setTimeout> | null = null;
let portTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleGitPoll(): void {
  gitTimer = setTimeout(async () => {
    await pollGitStatus();
    scheduleGitPoll();
  }, getInterval('git'));
}

function schedulePortPoll(): void {
  portTimer = setTimeout(async () => {
    await pollPorts();
    schedulePortPoll();
  }, getInterval('port'));
}

export function startPolling(): void {
  setTimeout(pollGitStatus, 1000);
  setTimeout(pollPorts, 3000);

  scheduleGitPoll();
  schedulePortPoll();

  window.addEventListener('focus', () => {
    if (!isFocused) {
      isFocused = true;
      log.debug('포커스 복귀 — 폴링 간격 단축');
      if (gitTimer) clearTimeout(gitTimer);
      if (portTimer) clearTimeout(portTimer);
      pollGitStatus();
      pollPorts();
      scheduleGitPoll();
      schedulePortPoll();
    }
  });

  window.addEventListener('blur', () => {
    isFocused = false;
    log.debug('포커스 이탈 — 폴링 간격 연장');
  });
}

export function stopPolling(): void {
  if (gitTimer) { clearTimeout(gitTimer); gitTimer = null; }
  if (portTimer) { clearTimeout(portTimer); portTimer = null; }
}
