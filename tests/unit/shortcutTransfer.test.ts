import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createShortcutBundle,
  parseShortcutBundle,
  SHORTCUT_FILE_LIMIT,
  uniqueImportedName,
} from '../../src/shared/shortcutTransfer';
import {
  readShortcutFile,
  serializeShortcutBundle,
  writeShortcutFile,
} from '../../src/main/services/shortcutFiles';
import type { Shortcut } from '../../src/shared/types/shortcut';
const command: Shortcut = {
  id: 'private-id',
  updatedAt: 123,
  name: '中文诊断',
  directory: "/tmp/' quoted",
  command: "# comment\ncat <<'END'\n中文 $HOME\nEND",
  sessionId: 'private-host-id',
};
const bundle = () => createShortcutBundle([command], () => '机器人 A');
describe('portable shortcut configuration', () => {
  it('round-trips multiline commands and scopes using only portable fields', () => {
    const value = createShortcutBundle(
      [command, { ...command, id: 'g', sessionId: null }],
      () => '机器人 A',
    );
    const serialized = serializeShortcutBundle(value);
    const parsed = parseShortcutBundle(JSON.parse(serialized));
    expect(parsed.shortcuts[0]).toEqual({
      name: command.name,
      directory: command.directory,
      command: command.command,
      scope: { kind: 'host', label: '机器人 A' },
    });
    expect(parsed.shortcuts[1].scope).toEqual({ kind: 'global' });
    expect(serialized).not.toContain('private-host-id');
    expect(serialized).not.toContain('private-id');
    expect(serialized).not.toContain('updatedAt');
  });
  it('strips extra metadata and normalizes Windows line endings without executing commands', () => {
    const value = bundle();
    const enriched = {
      ...value,
      password: 'secret',
      shortcuts: [
        {
          ...value.shortcuts[0],
          password: 'secret',
          sessionId: 'foreign',
          command: 'echo one\r\necho two',
        },
      ],
    };
    const text = serializeShortcutBundle(enriched);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('foreign');
    expect(parseShortcutBundle(JSON.parse(text)).shortcuts[0].command).toBe('echo one\necho two');
  });
  it('rejects unknown versions, malformed scope and invalid commands with entry numbers', () => {
    for (const value of [
      null,
      [],
      {},
      { ...bundle(), version: 2 },
      { ...bundle(), shortcuts: [] },
      { ...bundle(), shortcuts: Array(501).fill(bundle().shortcuts[0]) },
    ])
      expect(() => parseShortcutBundle(value)).toThrow();
    for (const patch of [
      { name: '' },
      { command: '\x1b[2J' },
      { directory: 'relative' },
      { scope: { kind: 'host' } },
      { scope: { kind: 'unexpected' } },
    ])
      expect(() =>
        parseShortcutBundle({ ...bundle(), shortcuts: [{ ...bundle().shortcuts[0], ...patch }] }),
      ).toThrow('#1:');
  });
  it('keeps imported names unique without exceeding the name length limit', () => {
    const names = new Set(['name', 'name (2)']);
    expect(uniqueImportedName('name', names)).toBe('name (3)');
    expect(uniqueImportedName('name', names)).toBe('name (4)');
    const long = 'x'.repeat(100);
    const next = uniqueImportedName(long, new Set([long]));
    expect(next).toHaveLength(100);
    expect(next.endsWith(' (2)')).toBe(true);
  });
  it('bounds export size before writing', () => {
    const large = createShortcutBundle(
      Array.from({ length: 200 }, () => ({ ...command, command: 'a'.repeat(16384) })),
      () => 'host',
    );
    expect(() => serializeShortcutBundle(large)).toThrow('2 MiB');
  });
  it('reads/writes portable UTF-8 JSON and rejects malformed, oversized and non-file inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mnl-transfer-'));
    try {
      const path = join(root, 'commands.json');
      await writeFile(path, 'previous content');
      await writeShortcutFile(path, serializeShortcutBundle(bundle()));
      expect(await readShortcutFile(path)).toEqual(bundle());
      const text = await readFile(path, 'utf8');
      await writeFile(path, '\ufeff' + text);
      expect(await readShortcutFile(path)).toEqual(bundle());
      await writeFile(path, Buffer.from([0xff, 0xfe]));
      await expect(readShortcutFile(path)).rejects.toThrow('UTF-8 JSON');
      await writeFile(path, '{broken');
      await expect(readShortcutFile(path)).rejects.toThrow('UTF-8 JSON');
      await writeFile(path, Buffer.alloc(SHORTCUT_FILE_LIMIT + 1));
      await expect(readShortcutFile(path)).rejects.toThrow('2 MiB');
      await expect(readShortcutFile(root)).rejects.toThrow('JSON');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
