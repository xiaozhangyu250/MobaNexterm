import type { TerminalConnectOptions } from '@shared/types/ipc';
import { ipcMain } from 'electron';
import { SSHClient } from '../services/SSHClient';
import { Channels } from '../utils/channels';

export function registerSshIpc(): void {
  ipcMain.handle(Channels.Ssh.Metrics, (event, tabId: string) =>
    SSHClient.metrics(tabId, event.sender.id),
  );
  ipcMain.handle(
    Channels.Ssh.Connect,
    (
      event,
      sessionId: string,
      tabId: string,
      reconnectCwd?: string,
      options?: TerminalConnectOptions,
    ) => SSHClient.connect(sessionId, tabId, reconnectCwd, options, event.sender.id),
  );
  ipcMain.on(Channels.Ssh.Acknowledge, (event, tabId: string, connectionId: string, size: number) =>
    SSHClient.acknowledge(tabId, connectionId, size, event.sender.id),
  );
  ipcMain.handle(Channels.Ssh.Write, (_e, tabId: string, data: string) =>
    SSHClient.write(tabId, data),
  );
  ipcMain.handle(Channels.Ssh.Resize, (_e, tabId: string, cols: number, rows: number) =>
    SSHClient.resize(tabId, cols, rows),
  );
  ipcMain.handle(Channels.Ssh.Disconnect, (_e, tabId: string) => SSHClient.disconnect(tabId));
}
