import { validateShortcut, type Shortcut, type ShortcutInput } from './types/shortcut';

export const SHORTCUT_FILE_LIMIT = 2 * 1024 * 1024;
export const SHORTCUT_ENTRY_LIMIT = 500;
export interface PortableShortcut {
  name: string;
  directory: string;
  command: string;
  scope: { kind: 'global' } | { kind: 'host'; label: string };
}
export interface ShortcutBundle {
  format: 'mobanexterm-shortcuts';
  version: 1;
  shortcuts: PortableShortcut[];
}
export interface ShortcutImportPreview {
  filename: string;
  shortcuts: PortableShortcut[];
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strict version/schema validation; return only portable fields, never host credentials or IDs. */
export function parseShortcutBundle(value: unknown): ShortcutBundle {
  if (!record(value) || value.format !== 'mobanexterm-shortcuts' || value.version !== 1)
    throw new Error('Unsupported shortcut file format or version / 不支持的快捷指令文件格式或版本');
  if (
    !Array.isArray(value.shortcuts) ||
    !value.shortcuts.length ||
    value.shortcuts.length > SHORTCUT_ENTRY_LIMIT
  )
    throw new Error('File must contain 1–500 commands / 文件应包含 1–500 条指令');
  const shortcuts = value.shortcuts.map((entry: unknown, index): PortableShortcut => {
    try {
      if (!record(entry) || !record(entry.scope))
        throw new Error('Invalid entry or scope / 无效的指令或范围');
      const scope = entry.scope;
      if (scope.kind !== 'global' && scope.kind !== 'host')
        throw new Error('Invalid scope / 无效的范围');
      if (
        scope.kind === 'host' &&
        (typeof scope.label !== 'string' || !scope.label.trim() || scope.label.length > 200)
      )
        throw new Error('Missing host label / 缺少有效主机名称');
      const input = {
        name: entry.name,
        directory: entry.directory,
        command:
          typeof entry.command === 'string'
            ? entry.command.replaceAll('\r\n', '\n')
            : entry.command,
        sessionId: null,
      } as ShortcutInput;
      validateShortcut(input);
      return {
        name: input.name.trim(),
        directory: input.directory,
        command: input.command,
        scope:
          scope.kind === 'global'
            ? { kind: 'global' }
            : { kind: 'host', label: scope.label as string },
      };
    } catch (error) {
      throw new Error(`#${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  return { format: 'mobanexterm-shortcuts', version: 1, shortcuts };
}

export function createShortcutBundle(
  items: Shortcut[],
  hostLabel: (id: string) => string,
): ShortcutBundle {
  return parseShortcutBundle({
    format: 'mobanexterm-shortcuts',
    version: 1,
    shortcuts: items.map((item) => ({
      name: item.name,
      directory: item.directory,
      command: item.command,
      scope:
        item.sessionId === null
          ? { kind: 'global' }
          : { kind: 'host', label: hostLabel(item.sessionId).slice(0, 200) },
    })),
  });
}

/** Import copies with unique local names. Existing commands are never overwritten. */
export function uniqueImportedName(name: string, used: Set<string>): string {
  let candidate = name.trim();
  let count = 2;
  while (used.has(candidate)) {
    const suffix = ` (${count++})`;
    candidate = name.trim().slice(0, 100 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}
