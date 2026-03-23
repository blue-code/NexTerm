#!/usr/bin/env node
/**
 * NexTerm CLI - Named Pipe를 통해 NexTerm 앱을 원격 제어하는 명령줄 도구.
 *
 * 사용법:
 *   nexterm new-workspace [--name NAME] [--cwd PATH]
 *   nexterm select-workspace --id ID
 *   nexterm rename-workspace --id ID --name NAME
 *   nexterm new-split [--direction horizontal|vertical]
 *   nexterm open-browser [--url URL]
 *   nexterm notify --title TITLE [--body BODY]
 *   nexterm send --panel-id ID --text TEXT
 *   nexterm focus-window
 */
import * as net from 'net';

const PIPE_NAME = '\\\\.\\pipe\\nexterm-ipc';

interface CliArgs {
  command: string;
  params: Record<string, string>;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const command = args[0] || 'help';
  const params: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      params[key] = value;
    }
  }

  return { command, params };
}

function sendCommand(method: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(PIPE_NAME, () => {
      const request = JSON.stringify({
        id: Date.now().toString(),
        method,
        params,
      });
      client.write(request + '\n');
    });

    let buffer = '';
    client.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.result);
          }
          client.end();
        } catch {
          // 아직 완전한 JSON이 아님
        }
      }
    });

    client.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        reject(new Error('NexTerm이 실행 중이지 않습니다. NexTerm을 먼저 시작하세요.'));
      } else {
        reject(err);
      }
    });

    // 3초 타임아웃
    setTimeout(() => {
      client.end();
      reject(new Error('응답 시간 초과'));
    }, 3000);
  });
}

function printHelp(): void {
  console.log(`
NexTerm CLI - AI 코딩 에이전트를 위한 터미널 멀티플렉서

사용법:
  nexterm <명령> [옵션]

명령:
  new-workspace        새 워크스페이스 생성
    --name NAME          워크스페이스 이름
    --cwd PATH           작업 디렉토리

  select-workspace     워크스페이스 전환
    --id ID              대상 워크스페이스 ID

  rename-workspace     워크스페이스 이름 변경
    --id ID              대상 워크스페이스 ID
    --name NAME          새 이름

  new-split            패널 분할
    --direction DIR      horizontal 또는 vertical (기본: horizontal)
    --cwd PATH           새 패널의 작업 디렉토리
    --shell SHELL        새 패널의 셸 (powershell.exe, cmd.exe 등)

  open-browser         브라우저 패널 열기
    --url URL            이동할 URL

  notify               알림 보내기
    --title TITLE        알림 제목
    --body BODY          알림 내용

  send                 패널에 텍스트 전송
    --panel-id ID        대상 패널 ID
    --text TEXT          전송할 텍스트

  focus-window         NexTerm 창 활성화

  tree                 워크스페이스/패널 계층 구조 표시

  help                 이 도움말 표시
`);
}

async function main(): Promise<void> {
  const { command, params } = parseArgs(process.argv);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  try {
    const result = await sendCommand(command, params);
    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      // tree 명령은 트리 문자열을 직접 출력
      if (obj.tree && typeof obj.tree === 'string') {
        console.log(obj.tree);
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else {
      console.log('완료');
    }
  } catch (err) {
    console.error(`오류: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
