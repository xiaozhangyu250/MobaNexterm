import { BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';
import { fitWindow } from './geometry';
import { DEFAULT_WINDOW, APP_NAME } from '@shared/constants';

const minimumSizes = new WeakMap<BrowserWindow, number[]>();

export function ensureWindowOnVisibleDisplay(win: BrowserWindow): void {
  if (win.isDestroyed() || win.isMinimized()) return;
  const displays = screen.getAllDisplays();
  const bounds = win.getBounds();
  const target = fitWindow(
    bounds,
    displays.map((d) => d.workArea),
  );
  const minimum = minimumSizes.get(win) ?? win.getMinimumSize();
  minimumSizes.set(win, minimum);
  const area = screen.getDisplayMatching(target).workArea;
  win.setMinimumSize(Math.min(minimum[0], area.width), Math.min(minimum[1], area.height));
  if (
    Object.keys(target).every(
      (key) => target[key as keyof typeof target] === bounds[key as keyof typeof bounds],
    )
  )
    return;
  const maximized = win.isMaximized();
  const fullscreen = win.isFullScreen();
  if (fullscreen) win.setFullScreen(false);
  if (maximized) win.unmaximize();
  win.setBounds(target);
  if (maximized) win.maximize();
  if (fullscreen) win.setFullScreen(true);
}

export function trackDisplays(win: BrowserWindow): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const repair = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ensureWindowOnVisibleDisplay(win), 150);
  };
  screen.on('display-removed', repair);
  screen.on('display-metrics-changed', repair);
  win.on('restore', repair);
  win.on('closed', () => {
    clearTimeout(timer);
    screen.off('display-removed', repair);
    screen.off('display-metrics-changed', repair);
  });
}

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
    backgroundColor: '#10151e',
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

  win.on('ready-to-show', () => {
    ensureWindowOnVisibleDisplay(win);
    win.show();
  });
  trackDisplays(win);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
