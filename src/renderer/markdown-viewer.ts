/**
 * 마크다운 뷰어 패널
 * 파일을 읽어 HTML로 변환하여 표시하고, 파일 변경 시 자동 리로드한다.
 * 외부 의존성 없이 경량 마크다운 파서를 내장한다.
 */
import { electronAPI } from './state';

/** 마크다운 뷰어 DOM을 생성하고 패널에 마운트한다 */
export function createMarkdownViewer(
  pane: HTMLElement,
  panelId: string,
  filePath: string,
): void {
  const container = document.createElement('div');
  container.className = 'markdown-viewer';
  container.dataset.panelId = panelId;

  const content = document.createElement('div');
  content.className = 'markdown-content';
  container.appendChild(content);
  pane.appendChild(container);

  // 초기 로드
  loadAndRender(content, filePath);

  // 파일 감시 시작
  electronAPI.invoke('file:watch', { filePath, panelId });

  // 파일 변경 시 자동 리로드
  electronAPI.on('file:changed', (payload: unknown) => {
    const data = payload as { panelId: string; filePath: string };
    if (data.panelId === panelId) {
      loadAndRender(content, data.filePath);
    }
  });
}

/** 파일 읽기 → 마크다운 변환 → DOM 갱신 */
async function loadAndRender(container: HTMLElement, filePath: string): Promise<void> {
  try {
    const text = await electronAPI.invoke('file:read', { filePath }) as string | null;
    if (text !== null) {
      container.innerHTML = markdownToHtml(text);
    } else {
      container.innerHTML = '<p style="color:var(--text-muted)">파일을 읽을 수 없습니다.</p>';
    }
  } catch {
    container.innerHTML = '<p style="color:var(--text-muted)">파일 로드 오류</p>';
  }
}

// ── 경량 마크다운 → HTML 변환 ──
// 헤더, 코드 블록, 인라인 코드, 볼드, 이탤릭, 링크, 이미지, 리스트, 인용, 수평선, 테이블

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = '';
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 코드 블록
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.push(`<pre><code class="lang-${esc(codeBlockLang)}">${esc(codeBlockContent.join('\n'))}</code></pre>`);
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        closeList();
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // 빈 줄
    if (line.trim() === '') {
      closeList();
      result.push('');
      continue;
    }

    // 수평선
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList();
      result.push('<hr>');
      continue;
    }

    // 헤더
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      closeList();
      const level = headerMatch[1].length;
      result.push(`<h${level}>${inline(headerMatch[2])}</h${level}>`);
      continue;
    }

    // 인용
    if (line.startsWith('> ')) {
      closeList();
      result.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }

    // 비정렬 리스트
    const ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${inline(ulMatch[2])}</li>`);
      continue;
    }

    // 정렬 리스트
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${inline(olMatch[2])}</li>`);
      continue;
    }

    // 테이블 (단순 감지)
    if (line.includes('|') && line.trim().startsWith('|')) {
      // 구분 줄인지 확인
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;
      const cells = line.split('|').filter(c => c.trim() !== '');
      // 다음 줄이 구분 줄이면 헤더
      const nextLine = lines[i + 1] || '';
      if (/^\|[\s\-:|]+\|$/.test(nextLine.trim())) {
        result.push('<table><thead><tr>' + cells.map(c => `<th>${inline(c.trim())}</th>`).join('') + '</tr></thead><tbody>');
      } else {
        result.push('<tr>' + cells.map(c => `<td>${inline(c.trim())}</td>`).join('') + '</tr>');
      }
      continue;
    }

    // 일반 문단
    closeList();
    result.push(`<p>${inline(line)}</p>`);
  }

  closeList();

  // 미닫힌 코드 블록 처리
  if (inCodeBlock) {
    result.push(`<pre><code>${esc(codeBlockContent.join('\n'))}</code></pre>`);
  }

  // 미닫힌 테이블 처리
  const html = result.join('\n');
  if (html.includes('<tbody>') && !html.includes('</tbody>')) {
    return html + '</tbody></table>';
  }

  return html;

  function closeList() {
    if (inList) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }
  }
}

/** 인라인 마크다운 변환 (볼드, 이탤릭, 코드, 링크, 이미지) */
function inline(text: string): string {
  let s = esc(text);
  // 이미지: ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">');
  // 링크: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // 인라인 코드: `code`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 볼드: **text** 또는 __text__
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // 이탤릭: *text* 또는 _text_
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.+?)_/g, '<em>$1</em>');
  // 취소선: ~~text~~
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return s;
}

/** HTML 이스케이프 */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
