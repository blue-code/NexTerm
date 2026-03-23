/** 日本語ロケール */
import { registerLocale } from '../i18n';

registerLocale('ja', {
  'app.title': 'NexTerm',

  'workspace.new': '新しいワークスペース',
  'workspace.close': 'ワークスペースを閉じる',
  'workspace.rename': 'ワークスペースの名前変更',
  'workspace.default_name': 'ワークスペース',
  'workspace.empty': 'Ctrl+Nで新しいワークスペースを作成',
  'workspace.rename_prompt': '新しい名前を入力...',
  'workspace.rename_hint': 'Enterで確定、Escでキャンセル',

  'panel.terminal': 'ターミナル',
  'panel.browser': 'ブラウザ',
  'panel.markdown': 'マークダウン',
  'panel.close': '閉じる',
  'panel.split_h': '水平分割',
  'panel.split_v': '垂直分割',
  'panel.search': '検索',

  'browser.back': '戻る',
  'browser.forward': '進む',
  'browser.reload': '再読み込み',
  'browser.url_placeholder': 'URLまたは検索語を入力...',
  'browser.find_placeholder': 'ページ内検索...',
  'browser.devtools': '開発者ツール',

  'cmd.new_workspace': '新しいワークスペース',
  'cmd.close_workspace': 'ワークスペースを閉じる',
  'cmd.rename_workspace': 'ワークスペースの名前変更',
  'cmd.split_h': '水平分割',
  'cmd.split_v': '垂直分割',
  'cmd.close_panel': 'パネルを閉じる',
  'cmd.open_browser': 'ブラウザを開く',
  'cmd.toggle_sidebar': 'サイドバー切替',
  'cmd.terminal_search': 'ターミナル内検索',
  'cmd.notifications': '通知を見る',
  'cmd.focus_next': '次のパネルへ',
  'cmd.focus_prev': '前のパネルへ',
  'cmd.next_workspace': '次のワークスペース',
  'cmd.prev_workspace': '前のワークスペース',
  'cmd.restore_tab': '閉じたブラウザタブを復元',
  'cmd.open_markdown': 'マークダウンファイルを開く',
  'cmd.search_placeholder': 'コマンドを検索...',

  'settings.title': '設定',
  'settings.font': 'フォント',
  'settings.font_size': 'フォントサイズ',
  'settings.scrollback': 'スクロールバック',
  'settings.theme': 'テーマ',
  'settings.bg_image': '背景画像',
  'settings.notification_sound': '通知音',
  'settings.shell': 'デフォルトシェル',
  'settings.language': '言語',

  'notification.title': '通知',
  'notification.mark_all_read': 'すべて既読にする',
  'notification.empty': '通知はありません',

  'agent.working': '作業中...',
  'agent.completed': '完了',
  'agent.toast_title': 'タスク完了',
  'agent.toast_body': 'エージェントが作業を終え、入力を待っています。',

  'terminal.process_exit': 'プロセス終了、コード:',

  'ctx.rename': '名前変更',
  'ctx.new_split': '新しいターミナル分割',
  'ctx.open_browser': 'ブラウザを開く',
  'ctx.close': '閉じる',

  'shortcuts.title': 'ショートカット',
});
