/**
 * 메인 프로세스용 구조화된 로거
 * 콘솔 + 파일 로깅 지원
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';
let logStream: fs.WriteStream | null = null;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** 파일 로깅 시작 (userData/logs 디렉토리) */
export function initFileLogging(): void {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, `nexterm-${new Date().toISOString().slice(0, 10)}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });

    // 오래된 로그 정리 (7일 이상)
    cleanOldLogs(logDir, 7);
  } catch (err) {
    console.error('로그 파일 초기화 실패:', err);
  }
}

function cleanOldLogs(logDir: string, maxDays: number): void {
  try {
    const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(logDir);
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const filePath = path.join(logDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // 정리 실패 무시
  }
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase().padEnd(5)}] [${module}] ${message}`;
}

function writeToFile(formatted: string): void {
  if (logStream) {
    logStream.write(formatted + '\n');
  }
}

/** 모듈별 로거 인스턴스 생성 */
export function createLogger(module: string) {
  return {
    debug(msg: string, ...args: any[]) {
      if (!shouldLog('debug')) return;
      const formatted = formatMessage('debug', module, msg);
      console.debug(formatted, ...args);
      writeToFile(formatted);
    },
    info(msg: string, ...args: any[]) {
      if (!shouldLog('info')) return;
      const formatted = formatMessage('info', module, msg);
      console.log(formatted, ...args);
      writeToFile(formatted);
    },
    warn(msg: string, ...args: any[]) {
      if (!shouldLog('warn')) return;
      const formatted = formatMessage('warn', module, msg);
      console.warn(formatted, ...args);
      writeToFile(formatted);
    },
    error(msg: string, ...args: any[]) {
      if (!shouldLog('error')) return;
      const formatted = formatMessage('error', module, msg);
      console.error(formatted, ...args);
      writeToFile(formatted);
    },
  };
}
