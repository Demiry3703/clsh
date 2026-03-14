import type { Terminal } from '@xterm/xterm';
import { CLSH_THEME } from './theme';

// Standard 16-color ANSI palette mapped to our terminal theme
const P16: readonly string[] = [
  CLSH_THEME.black!,         // 0  black
  CLSH_THEME.red!,           // 1  red
  CLSH_THEME.green!,         // 2  green
  CLSH_THEME.yellow!,        // 3  yellow
  CLSH_THEME.blue!,          // 4  blue
  CLSH_THEME.magenta!,       // 5  magenta
  CLSH_THEME.cyan!,          // 6  cyan
  CLSH_THEME.white!,         // 7  white
  CLSH_THEME.brightBlack!,   // 8  bright black
  CLSH_THEME.brightRed!,     // 9  bright red
  CLSH_THEME.brightGreen!,   // 10 bright green
  CLSH_THEME.brightYellow!,  // 11 bright yellow
  CLSH_THEME.brightBlue!,    // 12 bright blue
  CLSH_THEME.brightMagenta!, // 13 bright magenta
  CLSH_THEME.brightCyan!,    // 14 bright cyan
  CLSH_THEME.brightWhite!,   // 15 bright white
];

/** Resolve a cell's foreground color using xterm.js boolean helpers. */
function cellFgToHex(cell: import('@xterm/xterm').IBufferCell): string {
  if (cell.isFgDefault()) return CLSH_THEME.foreground!;
  if (cell.isFgRGB()) {
    const c = cell.getFgColor();
    const r = ((c >> 16) & 0xff).toString(16).padStart(2, '0');
    const g = ((c >> 8) & 0xff).toString(16).padStart(2, '0');
    const b = (c & 0xff).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  if (cell.isFgPalette()) return p256ToHex(cell.getFgColor());
  return CLSH_THEME.foreground!;
}

function p256ToHex(idx: number): string {
  if (idx < 16) return P16[idx] ?? CLSH_THEME.foreground!;
  if (idx >= 232) {
    const v = (8 + (idx - 232) * 10).toString(16).padStart(2, '0');
    return `#${v}${v}${v}`;
  }
  // 6×6×6 color cube
  const i = idx - 16;
  const toC = (v: number) => (v === 0 ? 0 : 55 + v * 40).toString(16).padStart(2, '0');
  return `#${toC(Math.floor(i / 36))}${toC(Math.floor((i / 6) % 6))}${toC(i % 6)}`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Reads the visible terminal viewport cell-by-cell and returns an HTML
 * string with <span style="color:..."> elements that match the actual
 * terminal colors. Used for the session card preview snapshot.
 */
export function captureColoredScreen(terminal: Terminal): string {
  const buf = terminal.buffer.active;
  const defaultFg = CLSH_THEME.foreground!;
  const htmlLines: string[] = [];

  for (let row = 0; row < terminal.rows; row++) {
    const line = buf.getLine(buf.viewportY + row);
    if (!line) break;

    let lineHtml = '';
    let curColor = defaultFg;
    let curBold = false;
    let curText = '';

    const flush = () => {
      if (!curText) return;
      const text = escHtml(curText);
      const isDefault = curColor === defaultFg && !curBold;
      if (isDefault) {
        lineHtml += text;
      } else {
        const styles = [`color:${curColor}`];
        if (curBold) styles.push('font-weight:bold');
        lineHtml += `<span style="${styles.join(';')}">${text}</span>`;
      }
      curText = '';
    };

    for (let col = 0; col < terminal.cols; col++) {
      const cell = line.getCell(col);
      if (!cell || cell.getWidth() === 0) continue;

      const chars = cell.getChars() || ' ';
      const color = cellFgToHex(cell);
      const bold = cell.isBold() === 1;

      if (color !== curColor || bold !== curBold) {
        flush();
        curColor = color;
        curBold = bold;
      }
      curText += chars;
    }
    flush();

    // Trim trailing whitespace from each line
    htmlLines.push(lineHtml.replace(/\s+$/, ''));
  }

  // Remove trailing blank lines
  while (htmlLines.length > 0 && htmlLines[htmlLines.length - 1].trim() === '') {
    htmlLines.pop();
  }

  return htmlLines.join('\n');
}
