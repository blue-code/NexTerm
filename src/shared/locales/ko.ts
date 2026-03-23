/** 한국어 로케일 (기본) */
import { registerLocale } from '../i18n';

registerLocale('ko', {
  // 타이틀바 / 일반
  'app.title': 'NexTerm',

  // 워크스페이스
  'workspace.new': '새 워크스페이스',
  'workspace.close': '워크스페이스 닫기',
  'workspace.rename': '워크스페이스 이름 변경',
  'workspace.default_name': '워크스페이스',
  'workspace.empty': 'Ctrl+N으로 새 워크스페이스를 생성하세요',
  'workspace.rename_prompt': '새 이름 입력...',
  'workspace.rename_hint': 'Enter로 확인, Esc로 취소',

  // 패널
  'panel.terminal': '터미널',
  'panel.browser': '브라우저',
  'panel.markdown': '마크다운',
  'panel.close': '닫기',
  'panel.split_h': '수평 분할',
  'panel.split_v': '수직 분할',
  'panel.search': '검색',

  // 브라우저
  'browser.back': '뒤로',
  'browser.forward': '앞으로',
  'browser.reload': '새로고침',
  'browser.url_placeholder': 'URL 또는 검색어 입력...',
  'browser.find_placeholder': '페이지에서 찾기...',
  'browser.devtools': '개발자 도구',

  // 커맨드 팔레트
  'cmd.new_workspace': '새 워크스페이스',
  'cmd.close_workspace': '워크스페이스 닫기',
  'cmd.rename_workspace': '워크스페이스 이름 변경',
  'cmd.split_h': '수평 분할',
  'cmd.split_v': '수직 분할',
  'cmd.close_panel': '패널 닫기',
  'cmd.open_browser': '브라우저 열기',
  'cmd.toggle_sidebar': '사이드바 토글',
  'cmd.terminal_search': '터미널 내 검색',
  'cmd.notifications': '알림 보기',
  'cmd.focus_next': '다음 패널로 이동',
  'cmd.focus_prev': '이전 패널로 이동',
  'cmd.next_workspace': '다음 워크스페이스',
  'cmd.prev_workspace': '이전 워크스페이스',
  'cmd.restore_tab': '닫은 브라우저 탭 복원',
  'cmd.open_markdown': '마크다운 파일 열기',
  'cmd.search_placeholder': '명령 검색...',

  // 설정
  'settings.title': '설정',
  'settings.font': '글꼴',
  'settings.font_size': '글꼴 크기',
  'settings.scrollback': '스크롤백',
  'settings.theme': '테마',
  'settings.bg_image': '배경 이미지',
  'settings.notification_sound': '알림 소리',
  'settings.shell': '기본 셸',
  'settings.language': '언어',

  // 알림
  'notification.title': '알림',
  'notification.mark_all_read': '모두 읽음 처리',
  'notification.empty': '알림이 없습니다',

  // 에이전트
  'agent.working': '작업 중...',
  'agent.completed': '작업 완료',
  'agent.toast_title': '작업 완료',
  'agent.toast_body': '에이전트가 작업을 마치고 입력을 기다리고 있습니다.',

  // 터미널
  'terminal.process_exit': '프로세스 종료, 코드:',

  // 컨텍스트 메뉴
  'ctx.rename': '이름 변경',
  'ctx.new_split': '새 터미널 분할',
  'ctx.open_browser': '브라우저 열기',
  'ctx.close': '닫기',

  // 단축키
  'shortcuts.title': '단축키',
});
