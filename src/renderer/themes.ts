/**
 * 터미널 테마 정의 + 적용 함수
 * UI 테마는 CSS 변수(data-theme 6종), 터미널 색상은 xterm 옵션으로 각각 처리한다.
 * CSS UI 테마가 없는 확장 테마는 배경 밝기 기반으로 dark/light 중 자동 매핑한다.
 */
import { state } from './state';

// CSS data-theme 셀렉터가 정의된 기본 UI 테마 목록
const CSS_UI_THEMES = ['dark', 'light', 'sakura', 'monokai', 'nord', 'solarized'];

export const TERMINAL_THEMES: Record<string, any> = {
  // ── 기본 6종 (CSS UI 테마 연동) ──
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

  // ── 확장 테마 (터미널 색상 전용, CSS UI는 dark/light 자동 매핑) ──
  'dracula': {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
    brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
  },
  'gruvbox-dark': {
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selectionBackground: '#504945',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
    brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
  },
  'gruvbox-light': {
    background: '#fbf1c7', foreground: '#3c3836', cursor: '#3c3836', selectionBackground: '#d5c4a1',
    black: '#fbf1c7', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#7c6f64',
    brightBlack: '#928374', brightRed: '#9d0006', brightGreen: '#79740e', brightYellow: '#b57614',
    brightBlue: '#076678', brightMagenta: '#8f3f71', brightCyan: '#427b58', brightWhite: '#3c3836',
  },
  'one-dark': {
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', selectionBackground: '#3e4452',
    black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
    brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b',
    brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff',
  },
  'one-light': {
    background: '#fafafa', foreground: '#383a42', cursor: '#526eff', selectionBackground: '#e5e5e6',
    black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#c18401',
    blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#a0a1a7',
    brightBlack: '#696c77', brightRed: '#e45649', brightGreen: '#50a14f', brightYellow: '#c18401',
    brightBlue: '#4078f2', brightMagenta: '#a626a4', brightCyan: '#0184bc', brightWhite: '#fafafa',
  },
  'catppuccin-mocha': {
    background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selectionBackground: '#45475a',
    black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
    blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
    brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
    brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
  },
  'catppuccin-latte': {
    background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78', selectionBackground: '#acb0be',
    black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
    blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#acb0be',
    brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b', brightYellow: '#df8e1d',
    brightBlue: '#1e66f5', brightMagenta: '#ea76cb', brightCyan: '#179299', brightWhite: '#bcc0cc',
  },
  'catppuccin-frappe': {
    background: '#303446', foreground: '#c6d0f5', cursor: '#f2d5cf', selectionBackground: '#51576d',
    black: '#51576d', red: '#e78284', green: '#a6d189', yellow: '#e5c890',
    blue: '#8caaee', magenta: '#f4b8e4', cyan: '#81c8be', white: '#b5bfe2',
    brightBlack: '#626880', brightRed: '#e78284', brightGreen: '#a6d189', brightYellow: '#e5c890',
    brightBlue: '#8caaee', brightMagenta: '#f4b8e4', brightCyan: '#81c8be', brightWhite: '#a5adce',
  },
  'catppuccin-macchiato': {
    background: '#24273a', foreground: '#cad3f5', cursor: '#f4dbd6', selectionBackground: '#494d64',
    black: '#494d64', red: '#ed8796', green: '#a6da95', yellow: '#eed49f',
    blue: '#8aadf4', magenta: '#f5bde6', cyan: '#8bd5ca', white: '#b8c0e0',
    brightBlack: '#5b6078', brightRed: '#ed8796', brightGreen: '#a6da95', brightYellow: '#eed49f',
    brightBlue: '#8aadf4', brightMagenta: '#f5bde6', brightCyan: '#8bd5ca', brightWhite: '#a5adcb',
  },
  'everforest-dark': {
    background: '#2d353b', foreground: '#d3c6aa', cursor: '#d3c6aa', selectionBackground: '#543a48',
    black: '#475258', red: '#e67e80', green: '#a7c080', yellow: '#dbbc7f',
    blue: '#7fbbb3', magenta: '#d699b6', cyan: '#83c092', white: '#d3c6aa',
    brightBlack: '#56635f', brightRed: '#e67e80', brightGreen: '#a7c080', brightYellow: '#dbbc7f',
    brightBlue: '#7fbbb3', brightMagenta: '#d699b6', brightCyan: '#83c092', brightWhite: '#d3c6aa',
  },
  'everforest-light': {
    background: '#fdf6e3', foreground: '#5c6a72', cursor: '#5c6a72', selectionBackground: '#e6e2cc',
    black: '#5c6a72', red: '#f85552', green: '#8da101', yellow: '#dfa000',
    blue: '#3a94c5', magenta: '#df69ba', cyan: '#35a77c', white: '#dfddc8',
    brightBlack: '#829181', brightRed: '#f85552', brightGreen: '#8da101', brightYellow: '#dfa000',
    brightBlue: '#3a94c5', brightMagenta: '#df69ba', brightCyan: '#35a77c', brightWhite: '#f4f0d9',
  },
  'kanagawa': {
    background: '#1f1f28', foreground: '#dcd7ba', cursor: '#c8c093', selectionBackground: '#2d4f67',
    black: '#090618', red: '#c34043', green: '#76946a', yellow: '#c0a36e',
    blue: '#7e9cd8', magenta: '#957fb8', cyan: '#6a9589', white: '#c8c093',
    brightBlack: '#727169', brightRed: '#e82424', brightGreen: '#98bb6c', brightYellow: '#e6c384',
    brightBlue: '#7fb4ca', brightMagenta: '#938aa9', brightCyan: '#7aa89f', brightWhite: '#dcd7ba',
  },
  'rose-pine': {
    background: '#191724', foreground: '#e0def4', cursor: '#524f67', selectionBackground: '#2a283e',
    black: '#26233a', red: '#eb6f92', green: '#31748f', yellow: '#f6c177',
    blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4',
    brightBlack: '#6e6a86', brightRed: '#eb6f92', brightGreen: '#31748f', brightYellow: '#f6c177',
    brightBlue: '#9ccfd8', brightMagenta: '#c4a7e7', brightCyan: '#ebbcba', brightWhite: '#e0def4',
  },
  'rose-pine-moon': {
    background: '#232136', foreground: '#e0def4', cursor: '#56526e', selectionBackground: '#393552',
    black: '#393552', red: '#eb6f92', green: '#3e8fb0', yellow: '#f6c177',
    blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ea9a97', white: '#e0def4',
    brightBlack: '#6e6a86', brightRed: '#eb6f92', brightGreen: '#3e8fb0', brightYellow: '#f6c177',
    brightBlue: '#9ccfd8', brightMagenta: '#c4a7e7', brightCyan: '#ea9a97', brightWhite: '#e0def4',
  },
  'rose-pine-dawn': {
    background: '#faf4ed', foreground: '#575279', cursor: '#9893a5', selectionBackground: '#f2e9de',
    black: '#575279', red: '#b4637a', green: '#286983', yellow: '#ea9d34',
    blue: '#56949f', magenta: '#907aa9', cyan: '#d7827e', white: '#f2e9de',
    brightBlack: '#9893a5', brightRed: '#b4637a', brightGreen: '#286983', brightYellow: '#ea9d34',
    brightBlue: '#56949f', brightMagenta: '#907aa9', brightCyan: '#d7827e', brightWhite: '#faf4ed',
  },
  'material': {
    background: '#263238', foreground: '#eeffff', cursor: '#ffcc00', selectionBackground: '#3b4f56',
    black: '#000000', red: '#f07178', green: '#c3e88d', yellow: '#ffcb6b',
    blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#eeffff',
    brightBlack: '#546e7a', brightRed: '#f07178', brightGreen: '#c3e88d', brightYellow: '#ffcb6b',
    brightBlue: '#82aaff', brightMagenta: '#c792ea', brightCyan: '#89ddff', brightWhite: '#ffffff',
  },
  'material-darker': {
    background: '#212121', foreground: '#eeffff', cursor: '#ffcc00', selectionBackground: '#3b3b3b',
    black: '#000000', red: '#f07178', green: '#c3e88d', yellow: '#ffcb6b',
    blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#eeffff',
    brightBlack: '#4a4a4a', brightRed: '#f07178', brightGreen: '#c3e88d', brightYellow: '#ffcb6b',
    brightBlue: '#82aaff', brightMagenta: '#c792ea', brightCyan: '#89ddff', brightWhite: '#ffffff',
  },
  'github-dark': {
    background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9', selectionBackground: '#264f78',
    black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
    blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
    brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
    brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
  },
  'github-light': {
    background: '#ffffff', foreground: '#24292e', cursor: '#24292e', selectionBackground: '#c8c8fa',
    black: '#24292e', red: '#d73a49', green: '#22863a', yellow: '#b08800',
    blue: '#0366d6', magenta: '#6f42c1', cyan: '#1b7c83', white: '#6a737d',
    brightBlack: '#959da5', brightRed: '#cb2431', brightGreen: '#28a745', brightYellow: '#dbab09',
    brightBlue: '#2188ff', brightMagenta: '#8a63d2', brightCyan: '#3192aa', brightWhite: '#fafbfc',
  },
  'ayu-dark': {
    background: '#0a0e14', foreground: '#b3b1ad', cursor: '#e6b450', selectionBackground: '#273747',
    black: '#01060e', red: '#ea6c73', green: '#91b362', yellow: '#f9af4f',
    blue: '#53bdfa', magenta: '#fae994', cyan: '#90e1c6', white: '#c7c7c7',
    brightBlack: '#686868', brightRed: '#f07178', brightGreen: '#c2d94c', brightYellow: '#ffb454',
    brightBlue: '#59c2ff', brightMagenta: '#ffee99', brightCyan: '#95e6cb', brightWhite: '#ffffff',
  },
  'ayu-mirage': {
    background: '#1f2430', foreground: '#cbccc6', cursor: '#ffcc66', selectionBackground: '#34455a',
    black: '#191e2a', red: '#ed8274', green: '#a6cc70', yellow: '#fad07b',
    blue: '#6dcbfa', magenta: '#cfbafa', cyan: '#90e1c6', white: '#c7c7c7',
    brightBlack: '#686868', brightRed: '#f28779', brightGreen: '#bae67e', brightYellow: '#ffd580',
    brightBlue: '#73d0ff', brightMagenta: '#d4bfff', brightCyan: '#95e6cb', brightWhite: '#ffffff',
  },
  'ayu-light': {
    background: '#fafafa', foreground: '#5c6773', cursor: '#ff6a00', selectionBackground: '#f0eee4',
    black: '#000000', red: '#f51818', green: '#86b300', yellow: '#f2ae49',
    blue: '#36a3d9', magenta: '#a37acc', cyan: '#4dbf99', white: '#ffffff',
    brightBlack: '#323232', brightRed: '#ff6565', brightGreen: '#b8e532', brightYellow: '#ffc94a',
    brightBlue: '#68d5ff', brightMagenta: '#dd80ff', brightCyan: '#4cd1a0', brightWhite: '#ffffff',
  },
  'palenight': {
    background: '#292d3e', foreground: '#a6accd', cursor: '#ffcc00', selectionBackground: '#3c435e',
    black: '#292d3e', red: '#f07178', green: '#c3e88d', yellow: '#ffcb6b',
    blue: '#82aaff', magenta: '#c792ea', cyan: '#89ddff', white: '#d0d0d0',
    brightBlack: '#434758', brightRed: '#ff8b92', brightGreen: '#ddffa7', brightYellow: '#ffe585',
    brightBlue: '#9cc4ff', brightMagenta: '#e1acff', brightCyan: '#a3f7ff', brightWhite: '#ffffff',
  },
  'night-owl': {
    background: '#011627', foreground: '#d6deeb', cursor: '#80a4c2', selectionBackground: '#1d3b53',
    black: '#011627', red: '#ef5350', green: '#22da6e', yellow: '#addb67',
    blue: '#82aaff', magenta: '#c792ea', cyan: '#21c7a8', white: '#ffffff',
    brightBlack: '#575656', brightRed: '#ef5350', brightGreen: '#22da6e', brightYellow: '#ffeb95',
    brightBlue: '#82aaff', brightMagenta: '#c792ea', brightCyan: '#7fdbca', brightWhite: '#ffffff',
  },
  'synthwave-84': {
    background: '#2b213a', foreground: '#f0eff1', cursor: '#f97e72', selectionBackground: '#463465',
    black: '#000000', red: '#f97e72', green: '#72f1b8', yellow: '#fede5d',
    blue: '#6d77b3', magenta: '#f772e0', cyan: '#36f9f6', white: '#f0eff1',
    brightBlack: '#615a76', brightRed: '#f97e72', brightGreen: '#72f1b8', brightYellow: '#fede5d',
    brightBlue: '#6d77b3', brightMagenta: '#f772e0', brightCyan: '#36f9f6', brightWhite: '#ffffff',
  },
  'cyberpunk': {
    background: '#181a1f', foreground: '#00ff9c', cursor: '#ff2e97', selectionBackground: '#2a2d35',
    black: '#000000', red: '#ff2e97', green: '#00ff9c', yellow: '#ffcc00',
    blue: '#00b0ff', magenta: '#ff2e97', cyan: '#00ffc8', white: '#f0f0f0',
    brightBlack: '#444444', brightRed: '#ff5cb8', brightGreen: '#00ffa0', brightYellow: '#ffe566',
    brightBlue: '#40c4ff', brightMagenta: '#ff6ec7', brightCyan: '#00ffd5', brightWhite: '#ffffff',
  },
  'horizon': {
    background: '#1c1e26', foreground: '#d5d8da', cursor: '#e95678', selectionBackground: '#2e303e',
    black: '#16161c', red: '#e95678', green: '#29d398', yellow: '#fab795',
    blue: '#26bbd9', magenta: '#ee64ac', cyan: '#59e1e3', white: '#d5d8da',
    brightBlack: '#6c6f93', brightRed: '#ec6a88', brightGreen: '#3fdaa4', brightYellow: '#fbc3a7',
    brightBlue: '#3fc4de', brightMagenta: '#f075b5', brightCyan: '#6be4e6', brightWhite: '#d5d8da',
  },
  'poimandres': {
    background: '#1b1e28', foreground: '#a6accd', cursor: '#a6accd', selectionBackground: '#303340',
    black: '#1b1e28', red: '#d0679d', green: '#5de4c7', yellow: '#fffac2',
    blue: '#89ddff', magenta: '#fcc5e9', cyan: '#add7ff', white: '#ffffff',
    brightBlack: '#506477', brightRed: '#d0679d', brightGreen: '#5de4c7', brightYellow: '#fffac2',
    brightBlue: '#89ddff', brightMagenta: '#fcc5e9', brightCyan: '#add7ff', brightWhite: '#ffffff',
  },
  'vitesse-dark': {
    background: '#121212', foreground: '#dbd7ca', cursor: '#dbd7ca', selectionBackground: '#333333',
    black: '#121212', red: '#cb7676', green: '#4d9375', yellow: '#e6cc77',
    blue: '#6394bf', magenta: '#d9739f', cyan: '#5eaab5', white: '#dbd7ca',
    brightBlack: '#555555', brightRed: '#cb7676', brightGreen: '#4d9375', brightYellow: '#e6cc77',
    brightBlue: '#6394bf', brightMagenta: '#d9739f', brightCyan: '#5eaab5', brightWhite: '#dbd7ca',
  },
  'vitesse-light': {
    background: '#ffffff', foreground: '#393a34', cursor: '#393a34', selectionBackground: '#e5e5e5',
    black: '#393a34', red: '#ab5959', green: '#1e754f', yellow: '#bda437',
    blue: '#296aa3', magenta: '#a13865', cyan: '#2e808f', white: '#dbd7ca',
    brightBlack: '#999999', brightRed: '#ab5959', brightGreen: '#1e754f', brightYellow: '#bda437',
    brightBlue: '#296aa3', brightMagenta: '#a13865', brightCyan: '#2e808f', brightWhite: '#ffffff',
  },
  'snazzy': {
    background: '#282a36', foreground: '#eff0eb', cursor: '#97979b', selectionBackground: '#3e4452',
    black: '#282a36', red: '#ff5c57', green: '#5af78e', yellow: '#f3f99d',
    blue: '#57c7ff', magenta: '#ff6ac1', cyan: '#9aedfe', white: '#f1f1f0',
    brightBlack: '#686868', brightRed: '#ff5c57', brightGreen: '#5af78e', brightYellow: '#f3f99d',
    brightBlue: '#57c7ff', brightMagenta: '#ff6ac1', brightCyan: '#9aedfe', brightWhite: '#f1f1f0',
  },
  'papercolor-dark': {
    background: '#1c1c1c', foreground: '#d0d0d0', cursor: '#d0d0d0', selectionBackground: '#3a3a3a',
    black: '#1c1c1c', red: '#af005f', green: '#5faf00', yellow: '#d7af5f',
    blue: '#5fafd7', magenta: '#808080', cyan: '#d7875f', white: '#d0d0d0',
    brightBlack: '#585858', brightRed: '#5faf5f', brightGreen: '#afd700', brightYellow: '#af87d7',
    brightBlue: '#ffaf00', brightMagenta: '#ff5faf', brightCyan: '#00afaf', brightWhite: '#5f8787',
  },
  'papercolor-light': {
    background: '#eeeeee', foreground: '#444444', cursor: '#444444', selectionBackground: '#d0d0d0',
    black: '#eeeeee', red: '#af0000', green: '#008700', yellow: '#5f8700',
    blue: '#0087af', magenta: '#878787', cyan: '#005f87', white: '#444444',
    brightBlack: '#bcbcbc', brightRed: '#d70000', brightGreen: '#d70087', brightYellow: '#8700af',
    brightBlue: '#d75f00', brightMagenta: '#d75f00', brightCyan: '#005faf', brightWhite: '#005f87',
  },
  'tokyo-night-storm': {
    background: '#24283b', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#364a82',
    black: '#1d202f', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
    blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
    brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
  },
  'tokyo-night-light': {
    background: '#d5d6db', foreground: '#343b59', cursor: '#343b59', selectionBackground: '#b6b8c3',
    black: '#0f0f14', red: '#8c4351', green: '#485e30', yellow: '#8f5e15',
    blue: '#34548a', magenta: '#5a4a78', cyan: '#0f4b6e', white: '#343b59',
    brightBlack: '#9699a3', brightRed: '#8c4351', brightGreen: '#485e30', brightYellow: '#8f5e15',
    brightBlue: '#34548a', brightMagenta: '#5a4a78', brightCyan: '#0f4b6e', brightWhite: '#343b59',
  },
  'solarized-light': {
    background: '#fdf6e3', foreground: '#657b83', cursor: '#657b83', selectionBackground: '#eee8d5',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
  },
  'tomorrow-night': {
    background: '#1d1f21', foreground: '#c5c8c6', cursor: '#c5c8c6', selectionBackground: '#373b41',
    black: '#1d1f21', red: '#cc6666', green: '#b5bd68', yellow: '#f0c674',
    blue: '#81a2be', magenta: '#b294bb', cyan: '#8abeb7', white: '#c5c8c6',
    brightBlack: '#969896', brightRed: '#cc6666', brightGreen: '#b5bd68', brightYellow: '#f0c674',
    brightBlue: '#81a2be', brightMagenta: '#b294bb', brightCyan: '#8abeb7', brightWhite: '#ffffff',
  },
  'tomorrow-night-eighties': {
    background: '#2d2d2d', foreground: '#cccccc', cursor: '#cccccc', selectionBackground: '#515151',
    black: '#2d2d2d', red: '#f2777a', green: '#99cc99', yellow: '#ffcc66',
    blue: '#6699cc', magenta: '#cc99cc', cyan: '#66cccc', white: '#cccccc',
    brightBlack: '#999999', brightRed: '#f2777a', brightGreen: '#99cc99', brightYellow: '#ffcc66',
    brightBlue: '#6699cc', brightMagenta: '#cc99cc', brightCyan: '#66cccc', brightWhite: '#ffffff',
  },
  'tomorrow': {
    background: '#ffffff', foreground: '#4d4d4c', cursor: '#4d4d4c', selectionBackground: '#d6d6d6',
    black: '#000000', red: '#c82829', green: '#718c00', yellow: '#eab700',
    blue: '#4271ae', magenta: '#8959a8', cyan: '#3e999f', white: '#ffffff',
    brightBlack: '#8e908c', brightRed: '#c82829', brightGreen: '#718c00', brightYellow: '#eab700',
    brightBlue: '#4271ae', brightMagenta: '#8959a8', brightCyan: '#3e999f', brightWhite: '#ffffff',
  },
  'cobalt2': {
    background: '#132738', foreground: '#ffffff', cursor: '#f0cc09', selectionBackground: '#1f4662',
    black: '#000000', red: '#ff0000', green: '#38de21', yellow: '#ffe50a',
    blue: '#1460d2', magenta: '#ff005d', cyan: '#00bbbb', white: '#bbbbbb',
    brightBlack: '#555555', brightRed: '#f40e17', brightGreen: '#3bd01d', brightYellow: '#edc809',
    brightBlue: '#5555ff', brightMagenta: '#ff55ff', brightCyan: '#6ae3fa', brightWhite: '#ffffff',
  },
  'oceanic-next': {
    background: '#1b2b34', foreground: '#c0c5ce', cursor: '#c0c5ce', selectionBackground: '#4f5b66',
    black: '#343d46', red: '#ec5f67', green: '#99c794', yellow: '#fac863',
    blue: '#6699cc', magenta: '#c594c5', cyan: '#5fb3b3', white: '#c0c5ce',
    brightBlack: '#65737e', brightRed: '#ec5f67', brightGreen: '#99c794', brightYellow: '#fac863',
    brightBlue: '#6699cc', brightMagenta: '#c594c5', brightCyan: '#5fb3b3', brightWhite: '#d8dee9',
  },
  'spacegray': {
    background: '#2c2c2c', foreground: '#b3b8c4', cursor: '#b3b8c4', selectionBackground: '#3f3f3f',
    black: '#2c2c2c', red: '#b04b57', green: '#87b379', yellow: '#e6c181',
    blue: '#6b9ebf', magenta: '#b07eb3', cyan: '#7ab0c5', white: '#b3b8c4',
    brightBlack: '#4b4b4b', brightRed: '#b04b57', brightGreen: '#87b379', brightYellow: '#e6c181',
    brightBlue: '#6b9ebf', brightMagenta: '#b07eb3', brightCyan: '#7ab0c5', brightWhite: '#f0f0f0',
  },
  'zenburn': {
    background: '#3f3f3f', foreground: '#dcdccc', cursor: '#dcdccc', selectionBackground: '#5f5f5f',
    black: '#1e2320', red: '#cc9393', green: '#7f9f7f', yellow: '#e3ceab',
    blue: '#dfaf8f', magenta: '#cc9393', cyan: '#8cd0d3', white: '#dcdccc',
    brightBlack: '#709080', brightRed: '#dca3a3', brightGreen: '#bfebbf', brightYellow: '#f0dfaf',
    brightBlue: '#93e0e3', brightMagenta: '#dca3a3', brightCyan: '#93e0e3', brightWhite: '#ffffff',
  },
  'andromeda': {
    background: '#23262e', foreground: '#d6d6d6', cursor: '#f8f8f0', selectionBackground: '#3e4046',
    black: '#000000', red: '#ee5d43', green: '#96e072', yellow: '#ffe66d',
    blue: '#7cb7ff', magenta: '#c74ded', cyan: '#00e8c6', white: '#d6d6d6',
    brightBlack: '#666666', brightRed: '#ee5d43', brightGreen: '#96e072', brightYellow: '#ffe66d',
    brightBlue: '#7cb7ff', brightMagenta: '#c74ded', brightCyan: '#00e8c6', brightWhite: '#ffffff',
  },
  'vesper': {
    background: '#101010', foreground: '#b7b7b7', cursor: '#b7b7b7', selectionBackground: '#2a2a2a',
    black: '#101010', red: '#f5a191', green: '#90b99c', yellow: '#e6b99d',
    blue: '#aca1cf', magenta: '#e29eca', cyan: '#ea83a5', white: '#b7b7b7',
    brightBlack: '#696969', brightRed: '#f5a191', brightGreen: '#90b99c', brightYellow: '#e6b99d',
    brightBlue: '#aca1cf', brightMagenta: '#e29eca', brightCyan: '#ea83a5', brightWhite: '#ffffff',
  },
  'flexoki-dark': {
    background: '#100f0f', foreground: '#cecdc3', cursor: '#cecdc3', selectionBackground: '#343331',
    black: '#1c1b1a', red: '#af3029', green: '#66800b', yellow: '#ad8301',
    blue: '#205ea6', magenta: '#a02f6f', cyan: '#24837b', white: '#cecdc3',
    brightBlack: '#575653', brightRed: '#d14d41', brightGreen: '#879a39', brightYellow: '#d0a215',
    brightBlue: '#4385be', brightMagenta: '#ce5d97', brightCyan: '#3aa99f', brightWhite: '#fffcf0',
  },
  'flexoki-light': {
    background: '#fffcf0', foreground: '#100f0f', cursor: '#100f0f', selectionBackground: '#e6e4d9',
    black: '#100f0f', red: '#af3029', green: '#66800b', yellow: '#ad8301',
    blue: '#205ea6', magenta: '#a02f6f', cyan: '#24837b', white: '#fffcf0',
    brightBlack: '#6f6e69', brightRed: '#d14d41', brightGreen: '#879a39', brightYellow: '#d0a215',
    brightBlue: '#4385be', brightMagenta: '#ce5d97', brightCyan: '#3aa99f', brightWhite: '#fffcf0',
  },
};

/** 테마 이름 목록 반환 (설정 UI 드롭다운용) */
export function getThemeNames(): string[] {
  return Object.keys(TERMINAL_THEMES);
}

/** 배경색 밝기로 dark/light 판별 → CSS UI 테마 매핑 */
function getCssUiTheme(themeName: string): string {
  // CSS data-theme 셀렉터가 있는 기본 테마면 그대로 사용
  if (CSS_UI_THEMES.includes(themeName)) return themeName;

  // 확장 테마: 배경색 밝기로 dark/light 자동 매핑
  const theme = TERMINAL_THEMES[themeName];
  if (!theme?.background) return 'dark';

  const brightness = hexBrightness(theme.background);
  return brightness > 128 ? 'light' : 'dark';
}

/** #rrggbb → 밝기 (0~255) */
function hexBrightness(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** CSS 테마 변수 + xterm 터미널 색상 동시 전환 */
export function applyTheme(themeName: string): void {
  // CSS UI 테마 적용 (dark/light 또는 기본 6종)
  const cssTheme = getCssUiTheme(themeName);
  document.documentElement.setAttribute('data-theme', cssTheme);

  // 터미널 색상 적용 (정확한 커스텀 테마)
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
