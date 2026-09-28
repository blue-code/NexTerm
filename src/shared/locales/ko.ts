/** 한국어 로케일 (기본) */
import { registerLocale } from '../i18n';

registerLocale('ko', {
  // 공통
  'common.cancel': '취소',
  'common.save': '저장',
  'common.delete': '삭제',
  'common.edit': '수정',
  'common.add': '추가',
  'common.browse': '찾기...',

  // 타이틀바 / 일반
  'app.title': 'NexTerm',
  'titlebar.toggle_sidebar': '사이드바 접기/펼치기 (Ctrl+B)',
  'titlebar.minimize': '최소화',
  'titlebar.maximize': '최대화',
  'titlebar.close': '닫기',

  // 사이드바
  'sidebar.workspaces': '워크스페이스',
  'sidebar.new_workspace_title': '새 워크스페이스 (Ctrl+N)',
  'sidebar.agent_working': '{name} 작업 중',
  'sidebar.agent_completed': '{name} 완료',

  // 워크스페이스
  'workspace.new': '새 워크스페이스',
  'workspace.close': '워크스페이스 닫기',
  'workspace.rename': '워크스페이스 이름 변경',
  'workspace.default_name': '워크스페이스',
  'workspace.empty': 'Ctrl+N으로 새 워크스페이스를 생성하세요',
  'workspace.rename_prompt': '새 이름 입력...',
  'workspace.rename_hint': 'Enter로 확인, Esc로 취소',
  'workspace.color_title': '워크스페이스 색상',

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
  'browser.find_title': '페이지 내 검색 (Ctrl+F)',
  'browser.devtools': '개발자 도구',

  // 터미널 내 검색
  'search.placeholder': '검색...',
  'search.prev': '이전',
  'search.next': '다음',

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
  'cmd.zoom_panel': '패널 줌/최대화 토글',
  'cmd.search_placeholder': '명령 검색...',

  // 설정
  'settings.title': '설정',
  'settings.font': '글꼴',
  'settings.font_size': '글꼴 크기',
  'settings.scrollback': '스크롤백',
  'settings.theme': '테마',
  'settings.bg_image': '배경 이미지',
  'settings.bg_image_placeholder': '이미지 경로 (비우면 해제)',
  'settings.notification_sound': '알림 소리',
  'settings.shell': '기본 셸',
  'settings.language': '언어',
  'settings.usage_display': '사용량 표시 (하단 바) — 표시할 항목 선택',
  'settings.usage_interval': '사용량 새로고침 주기 (초)',
  'settings.usage_refresh': '사용량 새로고침',

  // 테마
  'theme.dark': '다크 (Tokyo Night)',
  'theme.light': '라이트',
  'theme.sakura': '사쿠라 (핑크)',
  'theme.monokai': 'Monokai',
  'theme.nord': 'Nord',
  'theme.solarized': 'Solarized Dark',

  // 알림
  'notification.title': '알림',
  'notification.mark_all_read': '모두 읽음 처리',
  'notification.empty': '알림이 없습니다',

  // 에이전트
  'agent.working': '작업 중...',
  'agent.completed': '작업 완료',
  'agent.toast_title': '작업 완료',
  'agent.toast_body': '에이전트가 작업을 마치고 입력을 기다리고 있습니다.',
  'agent.tooltip_working': '{name} 작업 중...',
  'agent.tooltip_completed': '{name} 작업 완료',

  // 터미널
  'terminal.process_exit': '프로세스 종료, 코드:',
  'terminal.pipe_failed': 'NexTerm 파이프 연결 실패',

  // 컨텍스트 메뉴
  'ctx.rename': '이름 변경',
  'ctx.set_color': '색상 설정',
  'ctx.new_split': '새 터미널 분할',
  'ctx.open_browser': '브라우저 열기',
  'ctx.close': '닫기',
  'ctx.copy': '복사',
  'ctx.paste': '붙여넣기',
  'ctx.send_selection': '선택 영역 입력으로 전송',
  'ctx.select_all': '모두 선택',
  'ctx.clear_screen': '화면 지우기',
  'ctx.zoom_in': '패널 확장',
  'ctx.zoom_out': '패널 축소',

  // 단축키
  'shortcuts.title': '단축키',
  'shortcuts.section_workspace': '워크스페이스',
  'shortcuts.section_panel': '패널',
  'shortcuts.section_tools': '도구',
  'shortcuts.new_workspace': '새 워크스페이스',
  'shortcuts.close_workspace': '워크스페이스 닫기',
  'shortcuts.next_workspace': '다음 워크스페이스',
  'shortcuts.prev_workspace': '이전 워크스페이스',
  'shortcuts.close_panel': '패널 닫기',
  'shortcuts.next_panel': '다음 패널',
  'shortcuts.prev_panel': '이전 패널',
  'shortcuts.command_palette': '커맨드 팔레트',

  // 다음 명령 제안(pending input) 힌트
  'pending.next_command': '다음 명령',
  'pending.help': 'Enter 실행 · 타이핑 취소 · ← → 편집',

  // 마크다운 뷰어
  'markdown.read_error': '파일을 읽을 수 없습니다.',
  'markdown.load_error': '파일 로드 오류',

  // 자주쓰는 명령어 (사이드바)
  'fcmd.title': '자주쓰는 명령어',
  'fcmd.clear_all': '전체 삭제',
  'fcmd.filter_placeholder': '필터...',
  'fcmd.tooltip': '클릭: 입력, Shift+클릭: 실행',
  'fcmd.run_title': '실행 (Enter 포함)',
  'fcmd.empty_filtered': '일치하는 명령어가 없습니다.',
  'fcmd.empty': '아직 기록된 명령어가 없습니다.<br>터미널에서 명령을 실행하면 자동으로 누적됩니다.',
  'fcmd.confirm_clear': '자주쓰는 명령어 기록을 모두 삭제할까요?',

  // 알림창(alert)
  'alert.focus_terminal_first': '터미널 패널에 먼저 포커스하세요.',
  'alert.not_terminal_panel': '포커스된 패널이 터미널이 아닙니다.',

  // 빠른 명령 (패널 헤더)
  'qcmd.title': '빠른 명령',
  'qcmd.manage_title': '빠른 명령 관리',
  'qcmd.add_title': '새 명령 추가',
  'qcmd.search_placeholder': '빠른 명령 검색...',
  'qcmd.empty_filtered': '일치하는 명령이 없습니다.',
  'qcmd.empty': '이 디렉토리에 저장된 빠른 명령이 없습니다.<br>+ 버튼으로 이름을 붙여 저장하세요.',
  'qcmd.section_history': '명령',
  'qcmd.name_placeholder': '이름 (예: run)',
  'qcmd.cmd_placeholder': '명령어',
  'qcmd.run_tooltip': '클릭: 바로 실행',
  'qcmd.dropdown_title': '등록된 명령 목록',
  'qcmd.history_empty_filtered': '일치하는 기록이 없습니다.',
  'qcmd.history_empty': '아직 자동 기록된 명령이 없습니다.',

  // 새 패널 런처 (셸/AI 선택)
  'plauncher.search_placeholder': '셸/AI 검색...',
  'plauncher.empty': '일치하는 항목이 없습니다.',
  'plauncher.section_shell': '터미널 셸',
  'plauncher.section_ai': 'AI 에이전트',
  'plauncher.hint_shell': '셸',
  'plauncher.hint_ai': 'AI',
  'plauncher.skip_permissions': '(권한 스킵)',

  // 하단 상태바 사용량
  'usage.query_failed': '사용량 조회 실패',
  'usage.not_connected': '연결되지 않음',
  'usage.reset_suffix': '{time} 후 리셋',
  'usage.stale_suffix': '{time} 전 기준',
  'usage.stale_tooltip': '마지막 활동 시점 기준 데이터',
  'usage.window_session': '세션({hours}h)',
  'usage.window_weekly': '주간',
  'usage.window_days': '{days}일',
  'usage.limit_exceeded': '사용량 한도 초과',
  'usage.err.claude_parse': '사용량 응답 형식을 해석할 수 없습니다',
  'usage.err.claude_token_expired': 'Claude Code 토큰 만료 — claude를 한 번 실행해 갱신하세요',
  'usage.err.claude_no_creds': 'Claude Code 로그인 정보 없음 (~/.claude/.credentials.json)',
  'usage.err.claude_http': '사용량 API 오류 (HTTP {status})',
  'usage.err.codex_no_sessions': 'Codex 세션 기록 없음 (~/.codex/sessions)',
  'usage.err.codex_no_rate_limit': '최근 세션에서 rate limit 정보를 찾지 못했습니다',
  'usage.err.antigravity_no_login': 'Antigravity 로그인 정보 없음 — agy로 로그인하세요',
  'usage.err.antigravity_auth_expired': '인증 만료 — agy로 다시 로그인하세요',
  'usage.err.antigravity_http': '쿼터 API 오류 (HTTP {status})',
  'usage.err.antigravity_no_quota': '쿼터 정보를 찾을 수 없습니다',
});
