/**
 * 브라우저 히스토리 서비스
 * URL 방문 기록을 JSON 파일로 영속화하고, 검색 자동완성을 지원한다.
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { BrowserHistoryEntry } from '../../shared/types';

const MAX_ENTRIES = 5000;
const HISTORY_FILE = path.join(app.getPath('userData'), 'browser-history.json');

export class BrowserHistoryService {
  private entries: BrowserHistoryEntry[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  /** 방문 기록 추가 (이미 존재하면 방문 횟수 증가) */
  add(url: string, title: string): void {
    if (!url || url === 'about:blank') return;

    const existing = this.entries.find(e => e.url === url);
    if (existing) {
      existing.title = title || existing.title;
      existing.visitCount++;
      existing.lastVisitedAt = Date.now();
    } else {
      this.entries.push({
        url,
        title: title || url,
        visitCount: 1,
        lastVisitedAt: Date.now(),
      });
    }

    // 최대 개수 초과 시 오래된 항목 제거
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.sort((a, b) => b.lastVisitedAt - a.lastVisitedAt);
      this.entries = this.entries.slice(0, MAX_ENTRIES);
    }

    this.scheduleSave();
  }

  /** 검색어로 히스토리 필터링 (URL + 제목 매칭, 방문 횟수 기준 정렬) */
  search(query: string, limit = 10): BrowserHistoryEntry[] {
    if (!query) return this.getRecent(limit);

    const q = query.toLowerCase();
    return this.entries
      .filter(e => e.url.toLowerCase().includes(q) || e.title.toLowerCase().includes(q))
      .sort((a, b) => {
        // 방문 횟수 높은 순, 같으면 최근 방문 순
        if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
        return b.lastVisitedAt - a.lastVisitedAt;
      })
      .slice(0, limit);
  }

  /** 최근 방문 기록 조회 */
  getRecent(limit = 20): BrowserHistoryEntry[] {
    return [...this.entries]
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
      .slice(0, limit);
  }

  // ── 영속화 ──

  private load(): void {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        const json = fs.readFileSync(HISTORY_FILE, 'utf-8');
        this.entries = JSON.parse(json);
      }
    } catch {
      this.entries = [];
    }
  }

  private scheduleSave(): void {
    // 2초 디바운스로 빈번한 쓰기 방지
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 2000);
  }

  private save(): void {
    try {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.entries), 'utf-8');
    } catch {
      // 저장 실패는 무시 (다음 기회에 재시도)
    }
  }
}
