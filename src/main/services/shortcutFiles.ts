import { constants } from 'node:fs';
import { open, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  SHORTCUT_FILE_LIMIT,
  parseShortcutBundle,
  type ShortcutBundle,
} from '@shared/shortcutTransfer';

export function serializeShortcutBundle(bundle: ShortcutBundle): string {
  const text = JSON.stringify(parseShortcutBundle(bundle), null, 2) + '\n';
  if (Buffer.byteLength(text, 'utf8') > SHORTCUT_FILE_LIMIT)
    throw new Error('File exceeds 2 MiB; select fewer commands / 文件超过 2 MiB，请减少导出数量');
  return text;
}

export async function readShortcutFile(path: string): Promise<ShortcutBundle> {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > SHORTCUT_FILE_LIMIT)
      throw new Error('Choose a JSON file up to 2 MiB / 请选择不超过 2 MiB 的 JSON 文件');
    // Bounded even if a file grows between stat and read.
    const buffer = Buffer.alloc(SHORTCUT_FILE_LIMIT + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > SHORTCUT_FILE_LIMIT) throw new Error('File exceeds 2 MiB / 文件超过 2 MiB');
    let value: unknown;
    try {
      value = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)),
      );
    } catch {
      throw new Error('Invalid UTF-8 JSON file / 无效的 UTF-8 JSON 文件');
    }
    return parseShortcutBundle(value);
  } finally {
    await file.close();
  }
}

/** Finish writing before replacing a destination, leaving an existing export intact on failure. */
export async function writeShortcutFile(path: string, text: string): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
