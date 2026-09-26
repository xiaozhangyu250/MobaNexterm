import type { Terminal } from '@xterm/xterm';

/** Local notices are plain text; error messages must never execute terminal controls. */
export function formatTerminalNotice(lines: string[], cols: number, color: 'red' | 'cyan'): string {
  const separator = '─'.repeat(Math.max(2, Math.min(60, cols - 1)));
  const plain = lines.map((line) =>
    // eslint-disable-next-line no-control-regex
    line.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, '').replaceAll('\n', '\r\n'),
  );
  return `\r\n\x1b[${color === 'red' ? 31 : 36}m${separator}\r\n${plain.join('\r\n')}\r\n${separator}\x1b[0m\r\n`;
}

/** Append after queued output and the last occupied row, without clearing scrollback. */
export function appendTerminalNotice(
  term: Terminal,
  lines: string[],
  color: 'red' | 'cyan',
  isAlive: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    term.write('', () => {
      if (!isAlive()) {
        resolve();
        return;
      }
      const active = term.buffer.active;
      // A connection may die inside Vim/top. Preserve its final screen as text in
      // the normal buffer so both shell history and that screen remain scrollable.
      const snapshot: string[] = [];
      if (active.type === 'alternate') {
        for (let row = 0; row < term.rows; row++)
          snapshot.push(active.getLine(row)?.translateToString(true) ?? '');
        while (snapshot.at(-1) === '') snapshot.pop();
      }
      const buffer = term.buffer.normal;
      let lastRow = buffer.cursorY;
      for (let row = 0; row < term.rows; row++) {
        if (
          buffer
            .getLine(buffer.baseY + row)
            ?.translateToString(true)
            .trim()
        )
          lastRow = Math.max(lastRow, row);
      }
      // Cancel incomplete escape sequences, exit alternate screen, restore normal
      // input/scrolling modes and close any hyperlink left open by the remote app.
      const restore =
        '\x18\x1b\\\x1b[?1049l\x1b[!p\x1b[0m\x1b(B\x1b]8;;\x1b\\\x1b[?7h\x1b[?25h\x1b[?1000;1002;1003;1006;2004l';
      term.write(
        `${restore}\x1b[${lastRow + 1};1H${snapshot.length ? '\r\n' + snapshot.join('\r\n') : ''}${formatTerminalNotice(lines, term.cols, color)}`,
        resolve,
      );
    });
  });
}
