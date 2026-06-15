import { ipcMain } from 'electron';
import { SSHClient } from '../services/SSHClient';
import { Channels } from '../utils/channels';

export function registerSshIpc(): void {
  ipcMain.handle(Channels.Ssh.Connect, (_e, sessionId: string, tabId: string) =>
    SSHClient.connect(sessionId, tabId),
  );
  ipcMain.handle(Channels.Ssh.Write, (_e, tabId: string, data: string) =>
    SSHClient.write(tabId, data),
  );
  ipcMain.handle(Channels.Ssh.Resize, (_e, tabId: string, cols: number, rows: number) =>
    SSHClient.resize(tabId, cols, rows),
  );
  ipcMain.handle(Channels.Ssh.Disconnect, (_e, tabId: string) => SSHClient.disconnect(tabId));
}
