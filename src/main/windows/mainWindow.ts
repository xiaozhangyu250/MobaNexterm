import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { DEFAULT_WINDOW, APP_NAME } from '@shared/constants';

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const win = new BrowserWindow({
    title: APP_NAME,
    width: DEFAULT_WINDOW.width,
    height: DEFAULT_WINDOW.height,
    minWidth: DEFAULT_WINDOW.minWidth,
    minHeight: DEFAULT_WINDOW.minHeight,
    show: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    backgroundColor: '#0d0e10',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    titleBarOverlay: undefined,
    // Use vibrancy on macOS for true blur; on Windows 11 use mica; on Linux we fall back to CSS backdrop-filter.
    vibrancy: isMac ? 'under-window' : undefined,
    backgroundMaterial: isWin ? 'mica' : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
