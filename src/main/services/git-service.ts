/**
 * Git 상태 조회 서비스
 * 백그라운드에서 git/gh CLI를 호출하여 브랜치, dirty 상태, PR 정보를 가져온다.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface GitStatus {
  branch: string | null;
  dirty: boolean;
  prNumber: number | null;
  prTitle: string | null;
}

export class GitService {
  // 캐시 (5초 TTL)
  private cache = new Map<string, { data: GitStatus; timestamp: number }>();
  private readonly CACHE_TTL = 5000;

  async getStatus(cwd: string): Promise<GitStatus> {
    const cached = this.cache.get(cwd);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const status: GitStatus = {
      branch: null,
      dirty: false,
      prNumber: null,
      prTitle: null,
    };

    try {
      // 현재 브랜치명
      const { stdout: branch } = await execFileAsync(
        'git', ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd, timeout: 3000 }
      );
      status.branch = branch.trim();

      // dirty 상태 (uncommitted changes 여부)
      const { stdout: porcelain } = await execFileAsync(
        'git', ['status', '--porcelain'],
        { cwd, timeout: 3000 }
      );
      status.dirty = porcelain.trim().length > 0;

      // PR 정보 (gh CLI, 타임아웃 5초)
      try {
        const { stdout: prJson } = await execFileAsync(
          'gh', ['pr', 'view', '--json', 'number,title', '--jq', '.number,.title'],
          { cwd, timeout: 5000 }
        );
        const lines = prJson.trim().split('\n');
        if (lines.length >= 2) {
          status.prNumber = parseInt(lines[0], 10) || null;
          status.prTitle = lines[1] || null;
        }
      } catch {
        // gh CLI 없거나 PR 없는 경우 무시
      }
    } catch {
      // git 저장소가 아닌 경우 무시
    }

    this.cache.set(cwd, { data: status, timestamp: Date.now() });
    return status;
  }
}
