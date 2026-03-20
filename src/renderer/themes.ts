/**
 * 터미널 테마 정의 + 적용 함수
 * UI 테마는 CSS 변수(data-theme), 터미널 색상은 xterm 옵션으로 각각 처리한다.
 */
import { state } from './state';

export const TERMINAL_THEMES: Record<string, any> = {
  dark: {
    background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
    blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
    brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
  },
  light: {
    background: '#f0f0f3', foreground: '#1e1e2e', cursor: '#1e1e2e', selectionBackground: '#b4b4c4',
    black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
    blue: '#4a6cf7', magenta: '#8839ef', cyan: '#179299', white: '#e6e9ef',
    brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d',
    brightBlue: '#4a6cf7', brightMagenta: '#8839ef', brightCyan: '#179299', brightWhite: '#f0f0f3',
  },
  sakura: {
    background: '#2a1f2e', foreground: '#f5d0e6', cursor: '#f7a8d0', selectionBackground: '#6b4a7a',
    black: '#1a1520', red: '#f77088', green: '#b8e6a0', yellow: '#f0d080',
    blue: '#a0b8f0', magenta: '#f7a8d0', cyan: '#a0e0e0', white: '#f5d0e6',
    brightBlack: '#6e5466', brightRed: '#ff8899', brightGreen: '#c8f0b0', brightYellow: '#f8e0a0',
    brightBlue: '#b0c8ff', brightMagenta: '#ffc0e0', brightCyan: '#b0f0f0', brightWhite: '#fff0f8',
  },
  monokai: {
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', selectionBackground: '#49483e',
    black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
    blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
    brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75',
    brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5',
  },
  nord: {
    background: '#2e3440', foreground: '#eceff4', cursor: '#d8dee9', selectionBackground: '#4c566a',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
  },
  solarized: {
    background: '#002b36', foreground: '#93a1a1', cursor: '#93a1a1', selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900', brightYellow: '#b58900',
    brightBlue: '#268bd2', brightMagenta: '#6c71c4', brightCyan: '#2aa198', brightWhite: '#fdf6e3',
  },
};

/** CSS 테마 변수 + xterm 터미널 색상 동시 전환 */
export function applyTheme(themeName: string): void {
  document.documentElement.setAttribute('data-theme', themeName);
  const termTheme = TERMINAL_THEMES[themeName] || TERMINAL_THEMES.dark;
  for (const [, inst] of state.terminalInstances) {
    inst.terminal.options.theme = termTheme;
  }
}

/** 배경 이미지 적용 */
export function applyBackgroundImage(imagePath: string): void {
  if (imagePath) {
    const cssUrl = imagePath.startsWith('http')
      ? imagePath
      : `file:///${imagePath.replace(/\\/g, '/')}`;
    document.body.style.setProperty('--bg-image', `url("${cssUrl}")`);
    document.body.classList.add('has-bg-image');
  } else {
    document.body.classList.remove('has-bg-image');
    document.body.style.removeProperty('--bg-image');
  }
}
