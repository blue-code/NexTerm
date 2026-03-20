/**
 * 렌더러 TypeScript 모듈을 단일 번들로 빌드하는 esbuild 스크립트
 * contextIsolation 전환 후 xterm 포함 번들링 (electron만 외부)
 */
const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [path.resolve(__dirname, '../src/renderer/app.ts')],
  bundle: true,
  outfile: path.resolve(__dirname, '../dist/renderer/app.js'),
  // 브라우저 환경 (contextIsolation 적용, nodeIntegration 비활성)
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  sourcemap: true,
  // electron은 preload를 통해서만 접근하므로 번들에서 제외
  // xterm 라이브러리는 번들에 포함
  external: [],
  // Node.js 내장 모듈 shimming 방지
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'info',
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('렌더러 빌드 감시 시작...');
  } else {
    await esbuild.build(buildOptions);
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
