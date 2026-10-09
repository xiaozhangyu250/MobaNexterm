import Store from 'electron-store';
import { SHORTCUT_ENTRY_LIMIT, uniqueImportedName } from '@shared/shortcutTransfer';
import { randomUUID } from 'node:crypto';
import type { Shortcut, ShortcutInput } from '@shared/types/shortcut';
import { validateShortcut } from '@shared/types/shortcut';
import { SessionManager } from './SessionManager';

const store = new Store<{ shortcuts: Shortcut[] }>({
  name: 'shortcuts',
  defaults: { shortcuts: [] },
});
export const ShortcutManager = {
  list(): Shortcut[] {
    return store.get('shortcuts');
  },
  get(id: string): Shortcut {
    const item = this.list().find((s) => s.id === id);
    if (!item) throw new Error('Shortcut not found / 指令已删除');
    return item;
  },
  save(input: ShortcutInput, id?: string, expectedUpdatedAt?: number): Shortcut {
    validateShortcut(input);
    if (input.sessionId && !SessionManager.get(input.sessionId))
      throw new Error('Host no longer exists / 主机会话已删除');
    const existing = id ? this.get(id) : undefined;
    if (existing && existing.updatedAt !== expectedUpdatedAt)
      throw new Error('Shortcut changed; reopen the editor / 指令已修改，请重新打开编辑窗口');
    const item: Shortcut = {
      name: input.name.trim(),
      directory: input.directory,
      command: input.command,
      sessionId: input.sessionId,
      id: existing?.id ?? randomUUID(),
      updatedAt: Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1),
    };
    store.set(
      'shortcuts',
      existing ? this.list().map((s) => (s.id === item.id ? item : s)) : [...this.list(), item],
    );
    return item;
  },
  importCopies(inputs: ShortcutInput[]): Shortcut[] {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > SHORTCUT_ENTRY_LIMIT)
      throw new Error('Select 1–500 commands / 请选择 1–500 条指令');
    // Validate the entire batch before the single store write.
    for (const input of inputs) {
      validateShortcut(input);
      if (input.sessionId !== null && !SessionManager.get(input.sessionId))
        throw new Error('Target host no longer exists / 目标主机会话已删除，请重新选择');
    }
    const current = this.list();
    const names = new Set(current.map((item) => item.name));
    const imported = inputs.map(
      (input): Shortcut => ({
        name: uniqueImportedName(input.name, names),
        directory: input.directory,
        command: input.command,
        sessionId: input.sessionId,
        id: randomUUID(),
        updatedAt: Date.now(),
      }),
    );
    store.set('shortcuts', [...current, ...imported]);
    return imported;
  },
  remove(id: string): void {
    store.set(
      'shortcuts',
      this.list().filter((s) => s.id !== id),
    );
  },
};
