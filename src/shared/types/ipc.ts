import type { Session } from './session';

// IPC API contract — single source of truth shared by main / preload / renderer.

/** One row in the remote SFTP file list (serialisable subset of ssh2 attrs). */
export interface SftpListEntry {
  name: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  mtimeMs: number | null;
  mode: number | null;
}

export interface NewSessionInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authKind: 'password' | 'key';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  groupId?: string;
}

export type Language = 'en' | 'zh';

export interface TerminalConnectOptions {
  cols: number;
  rows: number;
  shellIntegration?: boolean;
}

export interface IpcApi {
  app: {
    ping(): Promise<'pong'>;
    getVersion(): Promise<string>;
    getPlatform(): Promise<NodeJS.Platform>;
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    fullscreen(): Promise<void>;
    openEditor(tabId: string, path: string): Promise<void>;
    showItemInFolder(path: string): Promise<void>;
    getPathForFile(file: File): string;
    setZoomFactor(factor: number): void;
  };
  session: {
    list(): Promise<Session[]>;
    create(input: NewSessionInput): Promise<Session>;
    update(id: string, patch: Partial<NewSessionInput>): Promise<Session>;
    remove(id: string): Promise<void>;
  };
  ssh: {
    /** Connects or reconnects the renderer-owned tab and resolves after the shell + SFTP handshake. */
    connect(
      sessionId: string,
      tabId: string,
      reconnectCwd?: string,
      options?: TerminalConnectOptions,
    ): Promise<{
      sftpAvailable: boolean;
      sftpMessage?: string;
    }>;
    write(tabId: string, data: string): Promise<void>;
    resize(tabId: string, cols: number, rows: number): Promise<void>;
    disconnect(tabId: string): Promise<void>;
    acknowledge(tabId: string, connectionId: string, size: number): void;
  };
  sftp: {
    list(tabId: string, path: string): Promise<SftpListEntry[]>;
    realpath(tabId: string, path: string): Promise<string>;
    mkdir(tabId: string, path: string): Promise<void>;
    remove(tabId: string, path: string, kind: 'file' | 'directory'): Promise<void>;
    rename(tabId: string, fromPath: string, toPath: string): Promise<void>;
    chmod(tabId: string, path: string, mode: number): Promise<void>;
    readFile(tabId: string, path: string): Promise<string>;
    writeFile(tabId: string, path: string, content: string, expected: string): Promise<void>;
    /** Opens a native file picker and uploads into `remoteDir`. */
    upload(tabId: string, remoteDir: string): Promise<void>;
    /** Uploads explicit local filesystem paths into `remoteDir`. */
    uploadPaths(tabId: string, remoteDir: string, localPaths: string[]): Promise<void>;
    /** Opens a save/folder dialog and downloads a remote file or directory. */
    download(tabId: string, remotePath: string, kind?: 'file' | 'directory'): Promise<void>;
    /** Creates a remote archive first, then downloads the archive locally. */
    downloadArchive(
      tabId: string,
      remotePath: string,
      format: 'zip' | 'tar.gz',
      sudoPassword?: string,
    ): Promise<void>;
  };
}

// Events emitted from main → renderer.
export interface IpcEventMap {
  'ssh:data': { tabId: string; data: string; connectionId: string };
  'ssh:cwd': { tabId: string; cwd: string };
  'ssh:status': {
    tabId: string;
    status: 'connecting' | 'connected' | 'closed' | 'error';
    message?: string;
  };
  'sftp:status': { tabId: string; available: boolean; message?: string };
  'sftp:progress': {
    taskId: string;
    tabId?: string;
    transferred: number;
    total: number;
    label?: string;
    direction?: 'upload' | 'download';
    localPath?: string;
  };
  'sftp:done': {
    taskId: string;
    tabId?: string;
    label?: string;
    direction?: 'upload' | 'download';
    localPath?: string;
  };
  'sftp:error': {
    taskId: string;
    tabId?: string;
    message: string;
    label?: string;
    direction?: 'upload' | 'download';
    localPath?: string;
  };
}

export type IpcEventName = keyof IpcEventMap;
