import { app, BrowserWindow, ipcMain } from 'electron';
import { Channels } from '../utils/channels';

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerAppIpc(): void {
  ipcMain.handle(Channels.App.Ping, () => 'pong' as const);
  ipcMain.handle(Channels.App.Version, () => app.getVersion());
  ipcMain.handle(Channels.App.Platform, () => process.platform);
  ipcMain.handle(Channels.App.Minimize, (event) => {
    windowFromEvent(event)?.minimize();
  });
  ipcMain.handle(Channels.App.Maximize, (event) => {
    const win = windowFromEvent(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle(Channels.App.Close, (event) => {
    windowFromEvent(event)?.close();
  });
}
