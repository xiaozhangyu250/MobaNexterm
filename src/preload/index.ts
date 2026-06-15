import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { Channels } from '../main/utils/channels';
import type { IpcApi, IpcEventMap, IpcEventName, NewSessionInput } from '@shared/types/ipc';

const api: IpcApi = {
  app: {
    ping: () => ipcRenderer.invoke(Channels.App.Ping),
    getVersion: () => ipcRenderer.invoke(Channels.App.Version),
    getPlatform: () => ipcRenderer.invoke(Channels.App.Platform),
    minimize: () => ipcRenderer.invoke(Channels.App.Minimize),
    maximize: () => ipcRenderer.invoke(Channels.App.Maximize),
    close: () => ipcRenderer.invoke(Channels.App.Close),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  session: {
    list: () => ipcRenderer.invoke(Channels.Session.List),
    create: (input: NewSessionInput) => ipcRenderer.invoke(Channels.Session.Create, input),
    update: (id: string, patch: Partial<NewSessionInput>) =>
      ipcRenderer.invoke(Channels.Session.Update, id, patch),
    remove: (id: string) => ipcRenderer.invoke(Channels.Session.Remove, id),
  },
  ssh: {
    connect: (sessionId: string, tabId: string) =>
      ipcRenderer.invoke(Channels.Ssh.Connect, sessionId, tabId),
    write: (tabId: string, data: string) => ipcRenderer.invoke(Channels.Ssh.Write, tabId, data),
    resize: (tabId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(Channels.Ssh.Resize, tabId, cols, rows),
    disconnect: (tabId: string) => ipcRenderer.invoke(Channels.Ssh.Disconnect, tabId),
  },
  sftp: {
    list: (tabId: string, path: string) => ipcRenderer.invoke(Channels.Sftp.ReadDir, tabId, path),
    realpath: (tabId: string, path: string) => ipcRenderer.invoke(Channels.Sftp.Realpath, tabId, path),
    mkdir: (tabId: string, path: string) => ipcRenderer.invoke(Channels.Sftp.Mkdir, tabId, path),
    remove: (tabId: string, path: string, kind: 'file' | 'directory') =>
      ipcRenderer.invoke(Channels.Sftp.Remove, tabId, path, kind),
    rename: (tabId: string, fromPath: string, toPath: string) =>
      ipcRenderer.invoke(Channels.Sftp.Rename, tabId, fromPath, toPath),
    chmod: (tabId: string, path: string, mode: number) =>
      ipcRenderer.invoke(Channels.Sftp.Chmod, tabId, path, mode),
    upload: (tabId: string, remoteDir: string) => ipcRenderer.invoke(Channels.Sftp.Upload, tabId, remoteDir),
    uploadPaths: (tabId: string, remoteDir: string, localPaths: string[]) =>
      ipcRenderer.invoke(Channels.Sftp.UploadPaths, tabId, remoteDir, localPaths),
    download: (tabId: string, remotePath: string, kind?: 'file' | 'directory') =>
      ipcRenderer.invoke(Channels.Sftp.Download, tabId, remotePath, kind),
  },
};

type EventListener<E extends IpcEventName> = (payload: IpcEventMap[E]) => void;

const events = {
  on<E extends IpcEventName>(name: E, listener: EventListener<E>): () => void {
    const handler = (_evt: IpcRendererEvent, payload: IpcEventMap[E]) => listener(payload);
    ipcRenderer.on(name, handler);
    return () => ipcRenderer.removeListener(name, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('events', events);
