import { BrowserWindow, dialog, screen } from 'electron';
import { join } from 'node:path';
import { trackDisplays, ensureWindowOnVisibleDisplay } from './mainWindow';
import { placeEditorWindow } from './geometry';

const editors = new Map<string, BrowserWindow>();
export function openEditorWindow(
  tabId: string,
  path: string,
  sourceWindow: BrowserWindow | null,
): void {
  if (!tabId || typeof path !== 'string' || !path.startsWith('/') || path.includes('\0'))
    throw new Error('Invalid editor target');
  const key = JSON.stringify([tabId, path]);
  const existing = editors.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  const anchor = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow.getBounds() : null;
  const workArea = anchor
    ? screen.getDisplayMatching(anchor).workArea
    : screen.getPrimaryDisplay().workArea;
  const bounds = placeEditorWindow(anchor ?? workArea, workArea);
  const win = new BrowserWindow({
    title: `${path} — MobaNexterm`,
    ...bounds,
    minWidth: Math.min(500, workArea.width),
    minHeight: Math.min(350, workArea.height),
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#10151e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  editors.set(key, win);
  trackDisplays(win);
  win.once('ready-to-show', () => {
    ensureWindowOnVisibleDisplay(win);
    win.show();
  });
  win.once('closed', () => editors.delete(key));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Unsaved changes / 未保存的修改',
      message: 'Discard unsaved changes? / 放弃未保存的修改？',
      detail: path,
      buttons: ['Keep editing / 继续编辑', 'Discard / 放弃'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  const hash = `editor?${new URLSearchParams({ tabId, path })}`;
  if (process.env['ELECTRON_RENDERER_URL'])
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash });
}
