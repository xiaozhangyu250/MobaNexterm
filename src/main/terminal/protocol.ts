import { StringDecoder } from 'node:string_decoder';

/** Keeps split UTF-8 characters and split OSC 7 sequences intact. */
export class TerminalDecoder {
  private decoder = new StringDecoder('utf8');
  private pendingOsc = '';

  constructor(private onDirectory: (path: string) => void) {}

  write(chunk: Buffer): string {
    const text = this.decoder.write(chunk);
    const input = this.pendingOsc + text;
    // eslint-disable-next-line no-control-regex
    const pattern = /\x1b\]7;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
    let match: RegExpExecArray | null;
    let consumed = 0;
    while ((match = pattern.exec(input))) {
      consumed = pattern.lastIndex;
      try {
        const url = new URL(match[1]);
        const path = decodeURIComponent(url.pathname);
        // eslint-disable-next-line no-control-regex
        if (url.protocol === 'file:' && path.startsWith('/') && !/[\x00-\x1f]/.test(path)) {
          this.onDirectory(path);
        }
      } catch {
        /* Malformed remote metadata must not interrupt terminal output. */
      }
    }
    const remaining = input.slice(consumed);
    const oscStart = remaining.indexOf('\x1b]7;');
    const start = oscStart >= 0 ? oscStart : remaining.lastIndexOf('\x1b');
    this.pendingOsc = start >= 0 && remaining.length - start <= 8192 ? remaining.slice(start) : '';
    return text;
  }
}

export function validTerminalSize(cols: number, rows: number): boolean {
  return (
    Number.isInteger(cols) &&
    Number.isInteger(rows) &&
    cols >= 2 &&
    rows >= 1 &&
    cols <= 1000 &&
    rows <= 1000
  );
}

/** Counts UTF-16 code units, matching the renderer's term.write acknowledgment. */
export class OutputFlow {
  private pending = 0;
  private paused = false;
  constructor(
    private pause: () => void,
    private resume: () => void,
  ) {}
  sent(size: number): void {
    this.pending += size;
    if (!this.paused && this.pending >= 256 * 1024) {
      this.paused = true;
      this.pause();
    }
  }
  acknowledge(size: number): void {
    if (!Number.isSafeInteger(size) || size <= 0) return;
    this.pending = Math.max(0, this.pending - size);
    if (this.paused && this.pending <= 64 * 1024) {
      this.paused = false;
      this.resume();
    }
  }
}
