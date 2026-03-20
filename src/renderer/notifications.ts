/**
 * 알림 관리 + 렌더링
 */
import { state, electronAPI, triggerSidebarRender } from './state';
import { generateId, formatTime, escapeHtml } from './utils';
import { selectWorkspace } from './workspace';
import type { AppNotification } from '../../shared/types';

const MAX_NOTIFICATIONS = 200;

let removeNotifClicked: (() => void) | null = null;

export function toggleNotifications(): void {
  const page = document.getElementById('notifications-page');
  const content = document.getElementById('workspace-content');
  page?.classList.toggle('hidden');
  content?.classList.toggle('hidden', !page?.classList.contains('hidden'));
  if (!page?.classList.contains('hidden')) {
    renderNotifications();
  }
}

export function renderNotifications(): void {
  const list = document.getElementById('notification-list');
  if (!list) return;
  list.innerHTML = '';

  if (state.notifications.length === 0) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">알림이 없습니다</div>';
    return;
  }

  for (const notif of [...state.notifications].reverse()) {
    const item = document.createElement('div');
    item.className = `notification-item${notif.read ? ' read' : ''}`;
    item.innerHTML = `
      <div class="notif-title">${escapeHtml(notif.title)}</div>
      <div class="notif-body">${escapeHtml(notif.body)}</div>
      <div class="notif-time">${formatTime(notif.timestamp)}</div>
    `;
    item.addEventListener('click', () => {
      notif.read = true;
      selectWorkspace(notif.workspaceId);
      toggleNotifications();
      triggerSidebarRender();
    });
    list.appendChild(item);
  }
}

export function addNotification(
  title: string,
  body: string,
  workspaceId?: string,
  panelId?: string,
): void {
  const notif: AppNotification = {
    id: generateId(),
    workspaceId: workspaceId || state.activeWorkspaceId || '',
    panelId: panelId || state.focusedPanelId || '',
    title,
    body,
    timestamp: Date.now(),
    read: false,
  };

  state.notifications.push(notif);

  if (state.notifications.length > MAX_NOTIFICATIONS) {
    state.notifications = state.notifications.slice(-MAX_NOTIFICATIONS);
  }

  const ws = state.workspaces.find(w => w.id === notif.workspaceId);
  if (ws) ws.unreadNotifications++;

  triggerSidebarRender();
  electronAPI.send('notification:send', notif);
}

/** 알림 클릭 IPC 리스너 등록 */
export function initNotificationListeners(): void {
  removeNotifClicked = electronAPI.on('notification:clicked', (payload: unknown) => {
    const notif = payload as AppNotification;
    if (notif?.workspaceId) {
      selectWorkspace(notif.workspaceId);
    }
  });
}

export function cleanupNotificationListeners(): void {
  removeNotifClicked?.();
  removeNotifClicked = null;
}
