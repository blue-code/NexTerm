/**
 * 로거 단위 테스트
 */
import { describe, it, expect, vi } from 'vitest';
import { createLogger, setLogLevel } from '../src/renderer/logger';

describe('createLogger', () => {
  it('모듈명이 로그 메시지에 포함된다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    setLogLevel('info');
    const log = createLogger('test-module');
    log.info('테스트 메시지');

    expect(spy).toHaveBeenCalledTimes(1);
    const msg = spy.mock.calls[0][0];
    expect(msg).toContain('[test-module]');
    expect(msg).toContain('테스트 메시지');
    expect(msg).toContain('[INFO ]');
    spy.mockRestore();
  });

  it('로그 레벨 이하의 메시지는 출력되지 않는다', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    setLogLevel('warn');
    const log = createLogger('test');
    log.debug('이 메시지는 보이면 안된다');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('error 레벨은 항상 출력된다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setLogLevel('error');
    const log = createLogger('test');
    log.error('에러 메시지');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
