import { ipcMain } from 'electron';
import { SessionManager } from '../services/SessionManager';
import { Channels } from '../utils/channels';
import type { NewSessionInput } from '@shared/types/ipc';

export function registerSessionIpc(): void {
  ipcMain.handle(Channels.Session.List, () => SessionManager.list());
  ipcMain.handle(Channels.Session.Create, (_e, input: NewSessionInput) =>
    SessionManager.create(input),
  );
  ipcMain.handle(Channels.Session.Update, (_e, id: string, patch: Partial<NewSessionInput>) =>
    SessionManager.update(id, patch),
  );
  ipcMain.handle(Channels.Session.Remove, (_e, id: string) => SessionManager.remove(id));
}
