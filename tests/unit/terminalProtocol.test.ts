import { describe, expect, it, vi } from 'vitest';
import { OutputFlow, TerminalDecoder, validTerminalSize } from '../../src/main/terminal/protocol';

describe('terminal byte stream', () => {
  it('preserves Chinese, combining characters, emoji and ANSI at every packet boundary', () => {
    const source = '\x1b[31m中文 e\u0301 🧑‍💻\x1b[0m\r\n';
    const bytes = Buffer.from(source);
    for (let split = 0; split <= bytes.length; split++) {
      const decoder = new TerminalDecoder(() => {});
      expect(decoder.write(bytes.subarray(0, split)) + decoder.write(bytes.subarray(split))).toBe(
        source,
      );
    }
  });
  it.each(['\x07', '\x1b\\'])('parses OSC 7 split at every boundary (%j)', (end) => {
    const source = Buffer.from(`\x1b]7;file://server/tmp/%E4%B8%AD%E6%96%87${end}`);
    for (let split = 0; split <= source.length; split++) {
      const cwd = vi.fn();
      const decoder = new TerminalDecoder(cwd);
      decoder.write(source.subarray(0, split));
      decoder.write(source.subarray(split));
      decoder.write(Buffer.from('prompt'));
      expect(cwd.mock.calls).toEqual([['/tmp/中文']]);
    }
  });
  it('ignores malformed and control-bearing directory metadata without altering output', () => {
    const cwd = vi.fn();
    const decoder = new TerminalDecoder(cwd);
    const text = '\x1b]7;https://host/path\x07\x1b]7;file://host/%00\x07\x1b]7;garbage\x07';
    expect(decoder.write(Buffer.from(text))).toBe(text);
    expect(cwd).not.toHaveBeenCalled();
  });
  it('validates PTY geometry without accepting NaN or fractions', () => {
    expect(validTerminalSize(132, 43)).toBe(true);
    for (const value of [NaN, Infinity, 0, -1, 1.5, 1001])
      expect(validTerminalSize(value, 24)).toBe(false);
  });
  it('pauses at high water and resumes only after parsing, ignoring malformed acknowledgements', () => {
    const pause = vi.fn();
    const resume = vi.fn();
    const flow = new OutputFlow(pause, resume);
    flow.sent(256 * 1024);
    flow.sent(10);
    expect(pause).toHaveBeenCalledTimes(1);
    flow.acknowledge(NaN);
    flow.acknowledge(-1);
    flow.acknowledge(1.5);
    expect(resume).not.toHaveBeenCalled();
    flow.acknowledge(200 * 1024);
    expect(resume).toHaveBeenCalledTimes(1);
    flow.sent(256 * 1024);
    expect(pause).toHaveBeenCalledTimes(2);
  });
});
