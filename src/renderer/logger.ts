/**
 * 구조화된 로거
 * 레벨별 필터링 + 컨텍스트 태그 지원.
 * 추후 파일 로깅 확장 가능.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatMessage(level: LogLevel, module: string, message: string): string {
  const ts = new Date().toISOString().slice(11, 23);
  return `[${ts}] [${level.toUpperCase().padEnd(5)}] [${module}] ${message}`;
}

/** 모듈별 로거 인스턴스 생성 */
export function createLogger(module: string) {
  return {
    debug(msg: string, ...args: any[]) {
      if (shouldLog('debug')) console.debug(formatMessage('debug', module, msg), ...args);
    },
    info(msg: string, ...args: any[]) {
      if (shouldLog('info')) console.log(formatMessage('info', module, msg), ...args);
    },
    warn(msg: string, ...args: any[]) {
      if (shouldLog('warn')) console.warn(formatMessage('warn', module, msg), ...args);
    },
    error(msg: string, ...args: any[]) {
      if (shouldLog('error')) console.error(formatMessage('error', module, msg), ...args);
    },
  };
}
