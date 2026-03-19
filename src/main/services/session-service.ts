/**
 * 세션 저장/복원 서비스
 * JSON 기반 스냅샷으로 워크스페이스 레이아웃, 작업 디렉토리, 브라우저 히스토리를 유지한다.
 * 8초 간격 자동 저장 (cmux 원본과 동일).
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { SessionSnapshot } from '../../shared/types';

export class SessionService {
  private readonly sessionPath: string;

  constructor() {
    const dataDir = app.getPath('userData');
    this.sessionPath = path.join(dataDir, 'session.json');
  }

  /** 세션 스냅샷 저장 */
  save(snapshot: SessionSnapshot): void {
    try {
      snapshot.savedAt = Date.now();
      const json = JSON.stringify(snapshot, null, 2);
      // 원자적 쓰기 (임시 파일 → 이름 변경)
      const tmpPath = this.sessionPath + '.tmp';
      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, this.sessionPath);
    } catch (err) {
      console.error('세션 저장 실패:', err);
    }
  }

  /** 세션 스냅샷 복원 */
  load(): SessionSnapshot | null {
    try {
      if (!fs.existsSync(this.sessionPath)) {
        return null;
      }
      const json = fs.readFileSync(this.sessionPath, 'utf-8');
      const snapshot = JSON.parse(json) as SessionSnapshot;

      // 버전 호환성 검증
      if (snapshot.version !== 1) {
        console.warn('호환되지 않는 세션 버전, 무시:', snapshot.version);
        return null;
      }

      // 너무 오래된 세션 (24시간 이상) 무시
      if (Date.now() - snapshot.savedAt > 24 * 60 * 60 * 1000) {
        console.warn('세션이 24시간 이상 경과, 무시');
        return null;
      }

      return snapshot;
    } catch (err) {
      console.error('세션 복원 실패:', err);
      return null;
    }
  }

  /** 세션 파일 삭제 */
  clear(): void {
    try {
      if (fs.existsSync(this.sessionPath)) {
        fs.unlinkSync(this.sessionPath);
      }
    } catch {
      // 무시
    }
  }
}
