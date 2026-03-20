/**
 * Named Pipe IPC 서버
 * Unix Domain Socket의 Windows 대응. CLI(nexterm 명령)에서 앱을 제어할 수 있게 한다.
 * 프로토콜: JSON-RPC 스타일
 */
import * as net from 'net';
import { IpcRequest, IpcResponse } from '../../shared/types';

type CommandHandler = (method: string, params: Record<string, unknown>) => unknown;

const PIPE_NAME = '\\\\.\\pipe\\nexterm-ipc';

export class IpcPipeServer {
  private server: net.Server | null = null;
  private commandHandler: CommandHandler | null = null;
  private retryCount = 0;
  private readonly MAX_RETRIES = 3;

  /** 명령 핸들러 등록 */
  onCommand(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

  /** 파이프 서버 시작 */
  start(): void {
    this.server = net.createServer((socket) => {
      let buffer = '';

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf-8');

        // 줄바꿈으로 메시지 구분
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          this.handleMessage(socket, line.trim());
        }
      });

      socket.on('error', () => {
        // 클라이언트 연결 끊김 등 무시
      });
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        if (this.retryCount >= this.MAX_RETRIES) {
          console.error('파이프 서버 시작 실패: 최대 재시도 횟수 초과');
          return;
        }
        this.retryCount++;
        console.warn(`파이프 이미 사용 중, 재시도 (${this.retryCount}/${this.MAX_RETRIES})...`);
        setTimeout(() => this.start(), 1000);
        return;
      }
      console.error('파이프 서버 오류:', err);
    });

    this.server.listen(PIPE_NAME, () => {
      this.retryCount = 0; // 성공 시 카운터 리셋
      console.log('IPC 파이프 서버 시작:', PIPE_NAME);
    });
  }

  /** 서버 중지 */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /** JSON-RPC 메시지 처리 */
  private handleMessage(socket: net.Socket, raw: string): void {
    let request: IpcRequest;
    try {
      request = JSON.parse(raw) as IpcRequest;
    } catch {
      this.sendResponse(socket, {
        id: 'unknown',
        error: '잘못된 JSON 형식',
      });
      return;
    }

    if (!request.method) {
      this.sendResponse(socket, {
        id: request.id,
        error: 'method 필드 필요',
      });
      return;
    }

    try {
      const result = this.commandHandler?.(request.method, request.params || {});
      this.sendResponse(socket, {
        id: request.id,
        result: result ?? { forwarded: true },
      });
    } catch (err) {
      this.sendResponse(socket, {
        id: request.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private sendResponse(socket: net.Socket, response: IpcResponse): void {
    try {
      socket.write(JSON.stringify(response) + '\n');
    } catch {
      // 소켓 이미 닫힌 경우 무시
    }
  }
}
