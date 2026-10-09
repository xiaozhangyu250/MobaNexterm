import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shortcut, ShortcutInput } from '../../src/shared/types/shortcut';
const state = vi.hoisted(() => ({ items: [] as Shortcut[] }));
vi.mock('electron-store', () => ({
  default: class {
    get() {
      return state.items;
    }
    set(_key: string, items: Shortcut[]) {
      state.items = items;
    }
  },
}));
vi.mock('../../src/main/services/SessionManager', () => ({
  SessionManager: { get: (id: string) => (id === 'host' ? { id } : undefined) },
}));
import { ShortcutManager } from '../../src/main/services/ShortcutManager';
const input: ShortcutInput = { name: 'hello', directory: '/tmp', command: 'pwd', sessionId: null };
beforeEach(() => {
  state.items = [];
});
describe('shortcut storage', () => {
  it('imports a batch with fresh ids and unique names without overwriting existing commands', () => {
    const existing = ShortcutManager.save(input);
    const added = ShortcutManager.importCopies([{ ...input, sessionId: 'host' }, input]);
    expect(added.map((item) => item.name)).toEqual(['hello (2)', 'hello (3)']);
    expect(added[0].sessionId).toBe('host');
    expect(added[1].sessionId).toBeNull();
    expect(new Set(ShortcutManager.list().map((item) => item.id)).size).toBe(3);
    expect(ShortcutManager.get(existing.id)).toEqual(existing);
  });
  it('rejects the whole import if any command or host is invalid', () => {
    const existing = ShortcutManager.save(input);
    expect(() =>
      ShortcutManager.importCopies([input, { ...input, sessionId: 'removed-host' }]),
    ).toThrow('Target host');
    expect(() => ShortcutManager.importCopies([input, { ...input, command: '' }])).toThrow();
    expect(() => ShortcutManager.importCopies([])).toThrow();
    expect(ShortcutManager.list()).toEqual([existing]);
  });
  it('creates, updates and removes commands with stable ids', () => {
    const item = ShortcutManager.save(input);
    const updated = ShortcutManager.save(
      { ...input, name: 'renamed', sessionId: 'host' },
      item.id,
      item.updatedAt,
    );
    expect(updated.id).toBe(item.id);
    expect(updated.updatedAt).toBeGreaterThan(item.updatedAt);
    expect(ShortcutManager.list()).toHaveLength(1);
    ShortcutManager.remove(item.id);
    expect(ShortcutManager.list()).toHaveLength(0);
  });
  it('does not overwrite a newer edit or resurrect a deleted command', () => {
    const item = ShortcutManager.save(input);
    ShortcutManager.save({ ...input, command: 'echo newer' }, item.id, item.updatedAt);
    expect(() => ShortcutManager.save(input, item.id, item.updatedAt)).toThrow('changed');
    expect(ShortcutManager.get(item.id).command).toBe('echo newer');
    ShortcutManager.remove(item.id);
    expect(() => ShortcutManager.save(input, item.id, item.updatedAt)).toThrow('not found');
  });
  it('rejects missing hosts without changing saved data', () => {
    expect(() => ShortcutManager.save({ ...input, sessionId: 'deleted' })).toThrow('Host');
    expect(ShortcutManager.list()).toEqual([]);
  });
});
