import { dialog, BrowserWindow, ipcMain } from 'electron';
import { basename, posix as pathPosix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SSHClient } from '../services/SSHClient';
import { Channels } from '../utils/channels';

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function send(event: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(event, payload);
  }
}

async function uploadLocalPaths(tabId: string, remoteDir: string, localPaths: string[]): Promise<void> {
  for (const localPath of localPaths) {
    const taskId = randomUUID();
    const label = basename(localPath);
    try {
      send(Channels.Sftp.ProgressEvent, {
        taskId,
        tabId,
        transferred: 0,
        total: 0,
        label,
        direction: 'upload',
      });
      await SSHClient.sftpUploadRecursive(tabId, localPath, remoteDir, (transferred, total) => {
        send(Channels.Sftp.ProgressEvent, {
          taskId,
          tabId,
          transferred,
          total,
          label,
          direction: 'upload',
        });
      });
      send(Channels.Sftp.DoneEvent, { taskId, tabId, label, direction: 'upload' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(Channels.Sftp.ErrorEvent, { taskId, tabId, message, label, direction: 'upload' });
      throw err;
    }
  }
}

export function registerSftpIpc(): void {
  ipcMain.handle(Channels.Sftp.ReadDir, (_e, tabId: string, remotePath: string) =>
    SSHClient.sftpList(tabId, remotePath),
  );
  ipcMain.handle(Channels.Sftp.Realpath, (_e, tabId: string, remotePath: string) =>
    SSHClient.sftpRealpath(tabId, remotePath),
  );
  ipcMain.handle(Channels.Sftp.Mkdir, (_e, tabId: string, remotePath: string) =>
    SSHClient.sftpMkdir(tabId, remotePath),
  );
  ipcMain.handle(Channels.Sftp.Remove, (_e, tabId: string, remotePath: string, kind: 'file' | 'directory') =>
    SSHClient.sftpRemove(tabId, remotePath, kind),
  );
  ipcMain.handle(Channels.Sftp.Rename, (_e, tabId: string, fromPath: string, toPath: string) =>
    SSHClient.sftpRename(tabId, fromPath, toPath),
  );
  ipcMain.handle(Channels.Sftp.Chmod, (_e, tabId: string, remotePath: string, mode: number) =>
    SSHClient.sftpChmod(tabId, remotePath, mode),
  );

  ipcMain.handle(Channels.Sftp.Upload, async (_e, tabId: string, remoteDir: string) => {
    const win = focusedWindow();
    if (!win) throw new Error('No window for file dialog');
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Upload to remote',
      properties: ['openFile', 'openDirectory', 'multiSelections'],
    });
    if (canceled || filePaths.length === 0) return;

    await uploadLocalPaths(tabId, remoteDir, filePaths);
  });

  ipcMain.handle(
    Channels.Sftp.UploadPaths,
    (_e, tabId: string, remoteDir: string, localPaths: string[]) =>
      uploadLocalPaths(tabId, remoteDir, localPaths),
  );

  ipcMain.handle(
    Channels.Sftp.Download,
    async (_e, tabId: string, remotePath: string, kind: 'file' | 'directory' = 'file') => {
    const win = focusedWindow();
    if (!win) throw new Error('No window for file dialog');
    const suggested = pathPosix.basename(remotePath) || 'download';
    const picker =
      kind === 'directory'
        ? await dialog.showOpenDialog(win, {
            title: 'Download remote directory into',
            properties: ['openDirectory', 'createDirectory'],
          })
        : await dialog.showSaveDialog(win, {
            title: 'Download remote file',
            defaultPath: suggested,
          });

    if (picker.canceled) return;

    const taskId = randomUUID();
    const label = suggested;
    try {
      send(Channels.Sftp.ProgressEvent, {
        taskId,
        tabId,
        transferred: 0,
        total: 0,
        label,
        direction: 'download',
      });
      if (kind === 'directory') {
        const localParent = 'filePaths' in picker ? picker.filePaths[0] : undefined;
        if (!localParent) return;
        await SSHClient.sftpDownloadRecursive(tabId, remotePath, localParent, (transferred, total) => {
          send(Channels.Sftp.ProgressEvent, {
            taskId,
            tabId,
            transferred,
            total,
            label,
            direction: 'download',
          });
        });
      } else {
        const filePath = 'filePath' in picker ? picker.filePath : undefined;
        if (!filePath) return;
        await SSHClient.sftpFastGet(tabId, remotePath, filePath, (transferred, total) => {
          send(Channels.Sftp.ProgressEvent, {
            taskId,
            tabId,
            transferred,
            total,
            label,
            direction: 'download',
          });
        });
      }
      send(Channels.Sftp.DoneEvent, { taskId, tabId, label, direction: 'download' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(Channels.Sftp.ErrorEvent, { taskId, tabId, message, label, direction: 'download' });
      throw err;
    }
    },
  );
}
