/**
 * 소켓 인증 서비스
 * Named Pipe 접속 시 비밀번호 인증을 처리한다.
 * 비밀번호 저장: %APPDATA%/nexterm/socket-password
 * 환경변수 오버라이드: NEXTERM_SOCKET_PASSWORD
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';

const PASSWORD_FILE = path.join(app.getPath('userData'), 'socket-password');

export class AuthService {
  private password: string | null = null;

  constructor() {
    this.loadPassword();
  }

  /** 비밀번호 검증 */
  verify(input: string): boolean {
    if (!this.password) return false;
    return input === this.password;
  }

  /** 현재 비밀번호 존재 여부 */
  hasPassword(): boolean {
    return this.password !== null && this.password.length > 0;
  }

  /** 비밀번호 설정 (파일에 저장) */
  setPassword(newPassword: string): void {
    this.password = newPassword;
    try {
      fs.writeFileSync(PASSWORD_FILE, newPassword, 'utf-8');
    } catch {
      // 저장 실패 시 메모리에만 유지
    }
  }

  /** 랜덤 비밀번호 생성 + 저장 */
  generatePassword(): string {
    const password = crypto.randomBytes(16).toString('hex');
    this.setPassword(password);
    return password;
  }

  /** 비밀번호 로드 (환경변수 우선, 파일 폴백) */
  private loadPassword(): void {
    // 환경변수 오버라이드
    const envPassword = process.env.NEXTERM_SOCKET_PASSWORD;
    if (envPassword) {
      this.password = envPassword;
      return;
    }

    // 파일 기반
    try {
      if (fs.existsSync(PASSWORD_FILE)) {
        this.password = fs.readFileSync(PASSWORD_FILE, 'utf-8').trim();
      }
    } catch {
      this.password = null;
    }
  }
}
