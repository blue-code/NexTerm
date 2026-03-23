/** 中文（简体）本地化 */
import { registerLocale } from '../i18n';

registerLocale('zh', {
  'app.title': 'NexTerm',

  'workspace.new': '新建工作区',
  'workspace.close': '关闭工作区',
  'workspace.rename': '重命名工作区',
  'workspace.default_name': '工作区',
  'workspace.empty': '按 Ctrl+N 创建新工作区',
  'workspace.rename_prompt': '输入新名称...',
  'workspace.rename_hint': 'Enter 确认，Esc 取消',

  'panel.terminal': '终端',
  'panel.browser': '浏览器',
  'panel.markdown': 'Markdown',
  'panel.close': '关闭',
  'panel.split_h': '水平分割',
  'panel.split_v': '垂直分割',
  'panel.search': '搜索',

  'browser.back': '后退',
  'browser.forward': '前进',
  'browser.reload': '刷新',
  'browser.url_placeholder': '输入 URL 或搜索词...',
  'browser.find_placeholder': '在页面中查找...',
  'browser.devtools': '开发者工具',

  'cmd.new_workspace': '新建工作区',
  'cmd.close_workspace': '关闭工作区',
  'cmd.rename_workspace': '重命名工作区',
  'cmd.split_h': '水平分割',
  'cmd.split_v': '垂直分割',
  'cmd.close_panel': '关闭面板',
  'cmd.open_browser': '打开浏览器',
  'cmd.toggle_sidebar': '切换侧边栏',
  'cmd.terminal_search': '终端内搜索',
  'cmd.notifications': '查看通知',
  'cmd.focus_next': '聚焦下一面板',
  'cmd.focus_prev': '聚焦上一面板',
  'cmd.next_workspace': '下一工作区',
  'cmd.prev_workspace': '上一工作区',
  'cmd.restore_tab': '恢复关闭的浏览器标签',
  'cmd.open_markdown': '打开 Markdown 文件',
  'cmd.search_placeholder': '搜索命令...',

  'settings.title': '设置',
  'settings.font': '字体',
  'settings.font_size': '字号',
  'settings.scrollback': '回滚行数',
  'settings.theme': '主题',
  'settings.bg_image': '背景图片',
  'settings.notification_sound': '通知声音',
  'settings.shell': '默认 Shell',
  'settings.language': '语言',

  'notification.title': '通知',
  'notification.mark_all_read': '全部标为已读',
  'notification.empty': '没有通知',

  'agent.working': '工作中...',
  'agent.completed': '已完成',
  'agent.toast_title': '任务完成',
  'agent.toast_body': '代理已完成工作，等待输入。',

  'terminal.process_exit': '进程退出，代码：',

  'ctx.rename': '重命名',
  'ctx.new_split': '新建终端分割',
  'ctx.open_browser': '打开浏览器',
  'ctx.close': '关闭',

  'shortcuts.title': '快捷键',
});
