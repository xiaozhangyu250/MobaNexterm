import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { registerAllIpc } from './ipc';
import { logger } from './services/Logger';
import { SSHClient } from './services/SSHClient';
import { APP_ID } from '@shared/constants';

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Single-instance lock — prevent multiple Electron processes managing same store.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerAllIpc();
    createMainWindow();
    logger.info('[main] ready');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    SSHClient.disconnectAll();
  });
}
