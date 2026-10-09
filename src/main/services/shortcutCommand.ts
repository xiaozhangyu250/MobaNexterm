import { spawn } from 'node:child_process';
import type { ShortcutInput, SyntaxCheck } from '@shared/types/shortcut';
import { validateShortcut } from '@shared/types/shortcut';

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** One physical input line; multiline scripts/heredocs are decoded by the shell, not readline. */
export function shortcutCommand(input: ShortcutInput): string {
  validateShortcut(input);
  // Preserve readable commands; escape only printf's backslash and physical line breaks.
  const encoded = input.command
    .replaceAll('\\', '\\0134')
    .replaceAll('\n', '\\n')
    .replaceAll('\t', '\\t');
  const directory =
    input.directory === '~'
      ? '"$HOME"'
      : input.directory.startsWith('~/')
        ? `"$HOME"/${quote(input.directory.slice(2))}`
        : quote(input.directory);
  return `${input.directory ? `cd -- ${directory} && ` : ''}eval "$(printf '%b' ${quote(encoded)})"\r`;
}

/** Syntax only: no evaluation, startup files, remote access or command execution. */
export function checkShellSyntax(command: string): Promise<SyntaxCheck> {
  if (typeof command !== 'string' || command.length > 16384 || command.includes('\0'))
    return Promise.resolve({ valid: false, message: 'Invalid command / 无效指令' });
  return new Promise((resolve) => {
    const child = spawn('bash', ['--noprofile', '--norc', '-n'], {
      env: { PATH: process.env.PATH, LC_ALL: 'C' },
    });
    let output = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.stderr.on('data', (chunk) => {
      output = (output + chunk.toString()).slice(0, 4096);
    });
    child.stdin.on('error', () => {});
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ valid: false, message: 'Bash unavailable / 无法启动 Bash 检查' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        valid: code === 0,
        message:
          output.trim() ||
          (code === 0
            ? 'Bash syntax OK / Bash 语法检查通过'
            : 'Syntax check failed / 语法检查失败'),
      });
    });
    child.stdin.end(command);
  });
}
