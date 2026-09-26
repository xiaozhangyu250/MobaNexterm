import { describe, expect, it } from 'vitest';
import { formatTerminalNotice } from '../../src/renderer/src/lib/terminalNotice';

describe('inline terminal notices', () => {
  it('separates red disconnect instructions from the previous prompt and resets the color', () => {
    const notice = formatTerminalNotice(['连接已断开', '按 R 重新连接'], 80, 'red');
    expect(notice).toBe(
      `\r\n\x1b[31m${'─'.repeat(60)}\r\n连接已断开\r\n按 R 重新连接\r\n${'─'.repeat(60)}\x1b[0m\r\n`,
    );
  });
  it('keeps separators within narrow terminals and normalizes multiline errors', () => {
    expect(formatTerminalNotice(['first\nsecond'], 12, 'red')).toContain(
      `${'─'.repeat(11)}\r\nfirst\r\nsecond\r\n`,
    );
  });
  it('does not execute escape or C1 control characters from error messages', () => {
    const notice = formatTerminalNotice(['bad\x1b[2J\x9b2J\r\x07message'], 80, 'red');
    expect(notice).toContain('bad[2J2Jmessage');
    expect(notice).not.toContain('\x1b[2J');
    expect(notice).not.toContain('\x07');
  });
});
