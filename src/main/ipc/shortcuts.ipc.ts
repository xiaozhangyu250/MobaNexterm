import { basename } from 'node:path';
import { createShortcutBundle, SHORTCUT_ENTRY_LIMIT } from '@shared/shortcutTransfer';
import {
  readShortcutFile,
  serializeShortcutBundle,
  writeShortcutFile,
} from '../services/shortcutFiles';
import { SessionManager } from '../services/SessionManager';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { ShortcutInput } from '@shared/types/shortcut';
import { ShortcutManager } from '../services/ShortcutManager';
import { checkShellSyntax, shortcutCommand } from '../services/shortcutCommand';
import { SSHClient } from '../services/SSHClient';
import { openToolWindow, retargetToolWindow } from '../windows/editorWindow';
import { Channels } from '../utils/channels';

export function registerShortcutsIpc(): void {
  const changed = () => {
    for (const win of BrowserWindow.getAllWindows())
      win.webContents.send(Channels.Shortcuts.Changed, {});
  };
  ipcMain.handle(Channels.Shortcuts.Export, async (event, ids: string[]) => {
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > SHORTCUT_ENTRY_LIMIT ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== 'string')
    )
      throw new Error('Select 1–500 commands / 请选择 1–500 条指令');
    const text = serializeShortcutBundle(
      createShortcutBundle(
        ids.map((id) => ShortcutManager.get(id)),
        (id) => SessionManager.get(id)?.name || 'Deleted host / 已删除的主机',
      ),
    );
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('Window closed');
    const result = await dialog.showSaveDialog(win, {
      title: 'Export commands / 导出快捷指令',
      defaultPath: 'mobanexterm-shortcuts.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeShortcutFile(result.filePath, text);
    return { count: ids.length, filename: basename(result.filePath) };
  });
  ipcMain.handle(Channels.Shortcuts.ChooseImport, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('Window closed');
    const result = await dialog.showOpenDialog(win, {
      title: 'Import commands / 导入快捷指令',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const bundle = await readShortcutFile(result.filePaths[0]);
    return { filename: basename(result.filePaths[0]), shortcuts: bundle.shortcuts };
  });
  ipcMain.handle(Channels.Shortcuts.Import, (_event, inputs: ShortcutInput[]) => {
    const imported = ShortcutManager.importCopies(inputs);
    changed();
    return imported;
  });
  ipcMain.handle(Channels.Shortcuts.List, () => ShortcutManager.list());
  ipcMain.handle(
    Channels.Shortcuts.Save,
    (event, input: ShortcutInput, id?: string, expected?: number) => {
      const item = ShortcutManager.save(input, id, expected);
      if (!id && event.sender.getURL().includes('#shortcut?'))
        retargetToolWindow(BrowserWindow.fromWebContents(event.sender), `shortcut:${item.id}`);
      changed();
      return item;
    },
  );
  ipcMain.handle(Channels.Shortcuts.Remove, (_e, id: string) => {
    ShortcutManager.remove(id);
    changed();
  });
  ipcMain.handle(Channels.Shortcuts.Check, (_e, command: string) => checkShellSyntax(command));
  ipcMain.handle(Channels.Shortcuts.Execute, (event, id: string, tabId: string) => {
    const shortcut = ShortcutManager.get(id);
    SSHClient.executeShortcut(
      tabId,
      shortcut.sessionId,
      shortcutCommand(shortcut),
      event.sender.id,
    );
  });
  ipcMain.handle(Channels.Shortcuts.OpenEditor, (event, id?: string, sessionId?: string) => {
    if (id) ShortcutManager.get(id);
    const query = new URLSearchParams({
      ...(id ? { id } : {}),
      ...(sessionId ? { sessionId } : {}),
    });
    openToolWindow(
      `shortcut:${id ?? 'new'}`,
      '快捷指令 / Quick command',
      `shortcut?${query}`,
      BrowserWindow.fromWebContents(event.sender),
    );
  });
}
