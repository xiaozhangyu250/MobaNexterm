import { BrowserWindow, dialog, screen } from 'electron';
import { join } from 'node:path';
import { trackDisplays, ensureWindowOnVisibleDisplay } from './mainWindow';
import { placeEditorWindow } from './geometry';

const editors = new Map<string, BrowserWindow>();
export function retargetToolWindow(win: BrowserWindow | null, key: string): void {
  if (!win) return;
  for (const [entry, existing] of editors) if (existing === win) editors.delete(entry);
  editors.set(key, win);
}
export function openEditorWindow(
  tabId: string,
  path: string,
  sourceWindow: BrowserWindow | null,
): void {
  if (!tabId || typeof path !== 'string' || !path.startsWith('/') || path.includes('\0'))
    throw new Error('Invalid editor target');
  openToolWindow(
    JSON.stringify([tabId, path]),
    path,
    `editor?${new URLSearchParams({ tabId, path })}`,
    sourceWindow,
  );
}

/** Non-modal tool windows share placement and unsaved-change protection. */
export function openToolWindow(
  key: string,
  title: string,
  hash: string,
  sourceWindow: BrowserWindow | null,
): void {
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
    title: `${title} — MobaNexterm`,
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
  win.once('closed', () => {
    for (const [entry, existing] of editors) if (existing === win) editors.delete(entry);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Unsaved changes / 未保存的修改',
      message: 'Discard unsaved changes? / 放弃未保存的修改？',
      detail: title,
      buttons: ['Keep editing / 继续编辑', 'Discard / 放弃'],
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
  });
  if (process.env['ELECTRON_RENDERER_URL'])
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash });
}
