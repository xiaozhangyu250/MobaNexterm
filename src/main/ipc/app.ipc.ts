import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { Channels } from '../utils/channels';
import { openEditorWindow } from '../windows/editorWindow';
import { ensureWindowOnVisibleDisplay } from '../windows/mainWindow';

function windowFromEvent(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerAppIpc(): void {
  ipcMain.handle(Channels.App.OpenEditor, (event, tabId: string, path: string) =>
    openEditorWindow(tabId, path, windowFromEvent(event)),
  );
  ipcMain.handle(Channels.App.Ping, () => 'pong' as const);
  ipcMain.handle(Channels.App.Version, () => app.getVersion());
  ipcMain.handle(Channels.App.Platform, () => process.platform);
  ipcMain.handle(Channels.App.Minimize, (event) => {
    windowFromEvent(event)?.minimize();
  });
  ipcMain.handle(Channels.App.Maximize, (event) => {
    const win = windowFromEvent(event);
    if (!win) return;
    if (win.isFullScreen()) win.setFullScreen(false);
    ensureWindowOnVisibleDisplay(win);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle(Channels.App.Fullscreen, (event) => {
    const win = windowFromEvent(event);
    if (win) win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle(Channels.App.Close, (event) => {
    windowFromEvent(event)?.close();
  });
  ipcMain.handle(Channels.App.ShowItemInFolder, (_event, path: string) => {
    shell.showItemInFolder(path);
  });
}
