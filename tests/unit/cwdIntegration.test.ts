import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cwdIntegrationCommand } from '../../src/main/terminal/cwdIntegration';
import { TerminalDecoder } from '../../src/main/terminal/protocol';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mnl-cwd-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function runBash(commands: string[]) {
  const result = spawnSync('bash', ['--noprofile', '--norc', '-i'], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: root,
      HISTFILE: '/dev/null',
      TERM: 'xterm-256color',
      PS1: '',
    },
    input: commands.map((line) => line.replace(/\r$/, '')).join('\n') + '\nexit\n',
    encoding: 'utf8',
    timeout: 5000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).not.toContain('syntax error');
  const directories: string[] = [];
  new TerminalDecoder((directory) => directories.push(directory)).write(Buffer.from(result.stdout));
  return { directories, stdout: result.stdout };
}

describe('real interactive Bash directory integration', () => {
  it('reports cd and cd .. at each prompt, including URL-special characters and quotes', () => {
    const directory = join(root, "中文 space #%?\\ ' [test]");
    mkdirSync(directory);
    const { directories } = runBash([cwdIntegrationCommand(), `cd ${quote(directory)}`, 'cd ..']);
    expect(directories).toContain(directory);
    expect(directories.at(-1)).toBe(root);
  });
  it('preserves an existing string PROMPT_COMMAND and the last command exit status', () => {
    const { stdout } = runBash([
      `PROMPT_COMMAND='printf "old-hook:%s\\n" "$?"'`,
      cwdIntegrationCommand(),
      'false',
      'true',
    ]);
    expect(stdout).toContain('old-hook:1');
    expect(stdout).toContain('old-hook:0');
  });
  it('preserves array hooks and does not install duplicate prompt handlers', () => {
    const { stdout } = runBash([
      `PROMPT_COMMAND=('printf "array-hook:%s\\n" "$?"')`,
      cwdIntegrationCommand(),
      cwdIntegrationCommand(),
      'false',
      `printf 'HOOKS:%s\\n' "\${PROMPT_COMMAND[*]}"`,
    ]);
    expect(stdout).toContain('array-hook:1');
    const hooks = stdout.match(/HOOKS:([^\n]+)/)?.[1] ?? '';
    expect(hooks.match(/__mnl_emit_cwd/g)).toHaveLength(1);
  });
  it('restores a quoted reconnect directory without interpreting its characters', () => {
    const directory = join(root, "reconnect ' $(echo not-executed) #%");
    mkdirSync(directory);
    const { directories } = runBash([cwdIntegrationCommand(directory)]);
    expect(directories.at(-1)).toBe(directory);
  });
  it('skips unsupported POSIX shells without a syntax error or changing directory', () => {
    const result = spawnSync('sh', ['-c', cwdIntegrationCommand().trim() + '; pwd'], {
      cwd: root,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe(root);
  });
});
