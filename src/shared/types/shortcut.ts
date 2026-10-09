export interface ShortcutInput {
  name: string;
  directory: string;
  command: string;
  /** null means global; otherwise a saved SSH session id. */
  sessionId: string | null;
}
export interface Shortcut extends ShortcutInput {
  id: string;
  updatedAt: number;
}
export interface SyntaxCheck {
  valid: boolean;
  message: string;
}

export function validateShortcut(input: ShortcutInput): void {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100)
    throw new Error('Name is required (max 100 characters) / 名称必填，最多 100 字符');
  if (typeof input.command !== 'string' || !input.command.trim() || input.command.length > 16384)
    throw new Error('Command is required (max 16384 characters) / 指令必填，最多 16384 字符');
  if (
    typeof input.directory !== 'string' ||
    input.directory.length > 4096 ||
    (input.directory &&
      !input.directory.startsWith('/') &&
      input.directory !== '~' &&
      !input.directory.startsWith('~/'))
  )
    throw new Error('Use an absolute path, ~ or ~/… / 目录应为绝对路径、~ 或 ~/…');
  const directoryHasControl = [...input.directory].some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
  // Terminal control bytes are never part of a saved command; multiline and tabs are supported.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(input.command) || directoryHasControl)
    throw new Error('Invalid control character / 包含无效控制字符');
  if (input.sessionId !== null && (typeof input.sessionId !== 'string' || !input.sessionId))
    throw new Error('Invalid session scope / 无效的主机范围');
}

export function availableShortcuts(shortcuts: Shortcut[], sessionId?: string): Shortcut[] {
  return shortcuts.filter((s) => s.sessionId === null || s.sessionId === sessionId);
}
