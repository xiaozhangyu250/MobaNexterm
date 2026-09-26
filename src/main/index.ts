import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { registerAllIpc } from './ipc';
import { logger } from './services/Logger';
import { SSHClient } from './services/SSHClient';
import { APP_ID } from '@shared/constants';

// Keep a strong reference to the window for its entire native lifetime. Without
// this, the BrowserWindow wrapper can be garbage-collected after creation,
// closing the only window and causing the application to quit on Linux/Windows.
let mainWindow: BrowserWindow | null = null;

function openMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

  const win = createMainWindow();
  mainWindow = win;
  const ownerId = win.webContents.id;
  win.once('closed', () => {
    SSHClient.disconnectOwner(ownerId);
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Single-instance lock — prevent multiple Electron processes managing same store.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerAllIpc();
    openMainWindow();
    logger.info('[main] ready');

    app.on('activate', () => {
      openMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    SSHClient.disconnectAll();
  });
}
