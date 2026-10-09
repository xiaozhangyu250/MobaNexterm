import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  availableShortcuts,
  validateShortcut,
  type ShortcutInput,
} from '../../src/shared/types/shortcut';
import { shortcutCommand, checkShellSyntax } from '../../src/main/services/shortcutCommand';
import { highlightShell } from '../../src/renderer/src/lib/shellHighlight';

const input: ShortcutInput = { name: 'test', directory: '', command: 'pwd', sessionId: null };
describe('quick commands', () => {
  it('filters global and saved-host scopes without leaking commands to other hosts', () => {
    const items = [null, 'a', 'b'].map((sessionId, i) => ({
      ...input,
      id: String(i),
      updatedAt: 1,
      sessionId,
    }));
    expect(availableShortcuts(items, 'a').map((s) => s.id)).toEqual(['0', '1']);
    expect(availableShortcuts(items).map((s) => s.id)).toEqual(['0']);
  });
  it('rejects invalid paths/control characters and empty commands', () => {
    for (const patch of [
      { directory: 'relative' },
      { directory: '/tmp\nwhoami' },
      { directory: '/tmp/\x1b[A' },
      { command: '\x1b[2J' },
      { command: '' },
    ])
      expect(() => validateShortcut({ ...input, ...patch })).toThrow();
  });
  it('executes multiline heredocs in a quoted directory and does not interpret path contents', () => {
    const root = mkdtempSync(join(tmpdir(), 'mnl-shortcut-'));
    try {
      const directory = join(root, "中文 ' $HOME # space");
      mkdirSync(directory);
      const command = shortcutCommand({
        ...input,
        directory,
        command: "cat <<'END'\nhello ' $HOME\nsecond line\nEND\nprintf 'DIR:%s\\n' \"$PWD\"",
      });
      expect(command.slice(0, -1)).not.toContain('\n');
      const result = spawnSync('bash', ['--noprofile', '--norc'], {
        input: command.replace(/\r$/, '\n'),
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("hello ' $HOME\nsecond line\n");
      expect(result.stdout).toContain('DIR:' + directory);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('does not execute any script when cd fails; expands only the intended home prefix', () => {
    const root = mkdtempSync(join(tmpdir(), 'mnl-shortcut-'));
    try {
      const missing = shortcutCommand({
        ...input,
        directory: join(root, 'missing'),
        command: "printf 'MUST_NOT_RUN'\nprintf 'SECOND'",
      });
      const failed = spawnSync('bash', ['--noprofile', '--norc'], {
        input: missing.replace(/\r$/, '\n'),
        encoding: 'utf8',
      });
      expect(failed.status).not.toBe(0);
      expect(failed.stdout).toBe('');
      const home = spawnSync('bash', ['--noprofile', '--norc'], {
        env: { HOME: root },
        input: shortcutCommand({ ...input, directory: '~' }).replace(/\r$/, '\n'),
        encoding: 'utf8',
      });
      expect(home.stdout.trim()).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('checks syntax without executing substitutions or writing files', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mnl-syntax-'));
    try {
      const target = join(root, 'should-not-exist');
      expect((await checkShellSyntax(`echo "$(touch '${target}')"\ntouch '${target}'`)).valid).toBe(
        true,
      );
      expect(existsSync(target)).toBe(false);
      const result = await checkShellSyntax('if true; then\necho broken');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('syntax error');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('highlights without altering or interpreting command text', () => {
    const source = '# comment\ncd \'/tmp/a\' && echo "$HOME"\n<script>alert(1)</script>';
    const tokens = highlightShell(source);
    expect(tokens.map((t) => t.text).join('')).toBe(source);
    expect(tokens.some((t) => t.kind === 'comment')).toBe(true);
    expect(tokens.some((t) => t.kind === 'string')).toBe(true);
  });
});
