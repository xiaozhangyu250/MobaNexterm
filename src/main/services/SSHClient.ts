import { parseMetrics, readMetrics, type CpuSample } from './remoteMetrics';
import type { RemoteMetrics } from '@shared/types/ipc';
import { cwdIntegrationCommand } from '../terminal/cwdIntegration';
import { Client, type ClientChannel, type SFTPWrapper, type FileEntryWithStats } from 'ssh2';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { basename, join as pathJoin, posix as pathPosix } from 'node:path';
import { BrowserWindow, webContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { OutputFlow, TerminalDecoder, validTerminalSize } from '../terminal/protocol';
import type { TerminalConnectOptions } from '@shared/types/ipc';
import { readRemoteText, writeRemoteText } from './remoteText';
import { SessionManager } from './SessionManager';
import { logger } from './Logger';
import { Channels } from '../utils/channels';
import type { SftpListEntry } from '@shared/types/ipc';

interface Tab {
  id: string;
  sessionId: string;
  client: Client;
  channel?: ClientChannel;
  sftp?: SFTPWrapper;
  cwd?: string;
  cols: number;
  rows: number;
  connectionId: string;
  ownerId?: number;
  flow?: OutputFlow;
  cpuSample?: CpuSample;
  metricsRequest?: Promise<RemoteMetrics>;
  lastMetrics?: RemoteMetrics;
}

const tabs = new Map<string, Tab>();

interface RemoteFile {
  remotePath: string;
  relativePath: string;
  size: number;
}

interface RemoteSymlink {
  remotePath: string;
  relativePath: string;
  target: string;
}

interface RemoteFileTree {
  files: RemoteFile[];
  dirs: string[];
  symlinks: RemoteSymlink[];
}

function send(event: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(event, payload);
  }
}

function sendStatus(
  tabId: string,
  status: 'connecting' | 'connected' | 'closed' | 'error',
  message?: string,
): void {
  send(Channels.Ssh.StatusEvent, { tabId, status, message });
}

function sendSftpStatus(tabId: string, available: boolean, message?: string): void {
  send(Channels.Sftp.StatusEvent, { tabId, available, message });
}

function sendCwd(tabId: string, cwd: string): void {
  const normalized = pathPosix.normalize(cwd);
  if (!normalized.startsWith('/')) return;
  const tab = tabs.get(tabId);
  if (tab?.cwd === normalized) return;
  if (tab) tab.cwd = normalized;
  send(Channels.Ssh.CwdEvent, { tabId, cwd: normalized });
}

function entryToListItem(e: FileEntryWithStats): SftpListEntry {
  const attrs = e.attrs;
  let isDirectory = false;
  let isSymlink = false;
  try {
    isDirectory = typeof attrs.isDirectory === 'function' ? attrs.isDirectory() : false;
    isSymlink = typeof attrs.isSymbolicLink === 'function' ? attrs.isSymbolicLink() : false;
  } catch {
    // attrs may be minimal
  }
  if (!isDirectory && !isSymlink && attrs.mode !== undefined) {
    isDirectory = (attrs.mode & 0o170000) === 0o040000;
    isSymlink = (attrs.mode & 0o170000) === 0o120000;
  }
  const mtime = attrs.mtime;
  return {
    name: e.filename,
    isDirectory,
    isSymlink,
    size: attrs.size ?? 0,
    mtimeMs: typeof mtime === 'number' && mtime > 0 ? mtime * 1000 : null,
    mode: attrs.mode ?? null,
  };
}

function getSftp(tabId: string): SFTPWrapper {
  const tab = tabs.get(tabId);
  if (!tab?.sftp) throw new Error('SFTP not available for this tab');
  return tab.sftp;
}

async function sftpEnsureDir(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  try {
    const stat = await sftpStat(sftp, remotePath);
    if (stat.isDirectory) return;
    throw new Error(`Remote path exists but is not a directory: ${remotePath}`);
  } catch {
    // The directory may not exist yet, or the server may only report a generic
    // SFTP failure. Try mkdir, then verify with stat for servers that return
    // "Failure" when mkdir races with or targets an existing directory.
  }

  await new Promise<void>((resolve, reject) => {
    sftp.mkdir(remotePath, async (err) => {
      if (!err) {
        resolve();
        return;
      }

      try {
        const stat = await sftpStat(sftp, remotePath);
        if (stat.isDirectory) resolve();
        else reject(new Error(`Remote path exists but is not a directory: ${remotePath}`));
      } catch {
        reject(err);
      }
    });
  });
}

function sftpMkdirp(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  const normalized = pathPosix.normalize(remotePath);
  const parts = normalized.split('/').filter(Boolean);
  let acc = normalized.startsWith('/') ? '/' : '.';

  return parts.reduce(
    (chain, part) =>
      chain.then(async () => {
        acc = acc === '/' ? `/${part}` : pathPosix.join(acc, part);
        await sftpEnsureDir(sftp, acc);
      }),
    Promise.resolve(),
  );
}

function sftpStat(
  sftp: SFTPWrapper,
  remotePath: string,
): Promise<{ isDirectory: boolean; size: number }> {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (err, attrs) => {
      if (err) {
        reject(err);
        return;
      }
      const isDirectory =
        typeof attrs.isDirectory === 'function'
          ? attrs.isDirectory()
          : attrs.mode !== undefined && (attrs.mode & 0o170000) === 0o040000;
      resolve({ isDirectory, size: attrs.size ?? 0 });
    });
  });
}

function sftpReadlink(sftp: SFTPWrapper, remotePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.readlink(remotePath, (err, target) => {
      if (err) reject(err);
      else resolve(target);
    });
  });
}

async function collectRemoteFiles(
  sftp: SFTPWrapper,
  remotePath: string,
  relativeBase = '',
): Promise<RemoteFileTree> {
  const stat = await sftpStat(sftp, remotePath);
  if (!stat.isDirectory) {
    return {
      files: [{ remotePath, relativePath: relativeBase || basename(remotePath), size: stat.size }],
      dirs: [],
      symlinks: [],
    };
  }

  const entries = await new Promise<FileEntryWithStats[]>((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) reject(err);
      else resolve(list ?? []);
    });
  });
  const dirs = [relativeBase].filter(Boolean);
  const files: RemoteFile[] = [];
  const symlinks: RemoteSymlink[] = [];

  for (const entry of entries) {
    const item = entryToListItem(entry);
    const nextRemote = pathPosix.join(remotePath, entry.filename);
    const nextRelative = relativeBase
      ? pathPosix.join(relativeBase, entry.filename)
      : entry.filename;
    if (item.isSymlink) {
      symlinks.push({
        remotePath: nextRemote,
        relativePath: nextRelative,
        target: await sftpReadlink(sftp, nextRemote),
      });
    } else if (item.isDirectory) {
      const child = await collectRemoteFiles(sftp, nextRemote, nextRelative);
      dirs.push(...child.dirs);
      files.push(...child.files);
      symlinks.push(...child.symlinks);
    } else {
      files.push({ remotePath: nextRemote, relativePath: nextRelative, size: item.size });
    }
  }

  return { files, dirs, symlinks };
}

function assertLocalFileSize(localPath: string, expectedSize: number): void {
  const actualSize = statSync(localPath).size;
  if (actualSize !== expectedSize) {
    throw new Error(
      `Downloaded file size mismatch: ${localPath} expected ${expectedSize} bytes, got ${actualSize}`,
    );
  }
}

async function assertRemoteFileSize(
  sftp: SFTPWrapper,
  remotePath: string,
  expectedSize: number,
): Promise<void> {
  const stat = await sftpStat(sftp, remotePath);
  if (stat.size !== expectedSize) {
    throw new Error(
      `Uploaded file size mismatch: ${remotePath} expected ${expectedSize} bytes, got ${stat.size}`,
    );
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function archiveName(remotePath: string, format: 'zip' | 'tar.gz'): string {
  const name = basename(remotePath) || 'download';
  return `${name}.${format}`;
}

function remoteArchivePath(remotePath: string, format: 'zip' | 'tar.gz'): string {
  const safeName = (basename(remotePath) || 'download').replace(/[^A-Za-z0-9._-]+/g, '_');
  return pathPosix.join('/tmp', `mobanexterm-${Date.now()}-${safeName}.${format}`);
}

function archiveCommand(remotePath: string, archivePath: string, format: 'zip' | 'tar.gz'): string {
  const parent = pathPosix.dirname(remotePath);
  const name = basename(remotePath);
  if (!name) throw new Error(`Cannot archive remote root path: ${remotePath}`);
  if (format === 'zip') {
    return `cd ${shellQuote(parent)} && zip -r ${shellQuote(archivePath)} ${shellQuote(name)}`;
  }
  return `cd ${shellQuote(parent)} && tar -czf ${shellQuote(archivePath)} ${shellQuote(name)}`;
}

function sudoCommand(command: string): string {
  return `sudo -S -p '' sh -c ${shellQuote(command)}`;
}

function collectLocalFiles(
  localPath: string,
  relativeBase = basename(localPath),
): {
  files: { localPath: string; relativePath: string; size: number }[];
  dirs: string[];
  isDirectory: boolean;
} {
  const stat = statSync(localPath);
  if (!stat.isDirectory()) {
    return {
      files: [{ localPath, relativePath: relativeBase, size: stat.size }],
      dirs: [],
      isDirectory: false,
    };
  }

  const dirs = [relativeBase];
  const files: { localPath: string; relativePath: string; size: number }[] = [];
  for (const name of readdirSync(localPath)) {
    const nextLocal = pathJoin(localPath, name);
    const nextRelative = pathPosix.join(relativeBase, name);
    const child = collectLocalFiles(nextLocal, nextRelative);
    dirs.push(...child.dirs);
    files.push(...child.files);
  }
  return { files, dirs, isDirectory: true };
}

function disconnectTab(tabId: string, announce = true): void {
  const tab = tabs.get(tabId);
  if (!tab) return;
  tabs.delete(tabId);
  try {
    tab.sftp?.end();
    tab.channel?.close();
    tab.client.end();
  } catch (e) {
    logger.warn('error closing ssh tab', { tabId, error: String(e) });
  }
  if (announce) sendStatus(tabId, 'closed');
}

export const SSHClient = {
  async connect(
    sessionId: string,
    tabId: string,
    reconnectCwd?: string,
    options?: TerminalConnectOptions,
    ownerId?: number,
  ): Promise<{
    sftpAvailable: boolean;
    sftpMessage?: string;
  }> {
    const session = SessionManager.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const connectConfig: Parameters<Client['connect']>[0] = {
      host: session.host,
      port: session.port,
      username: session.username,
      readyTimeout: 15000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    };

    if (session.auth.kind === 'password') {
      const pw = SessionManager.resolveSecret(session.auth.password);
      if (!pw) throw new Error('Password not found in credential store');
      connectConfig.password = pw;
    } else if (session.auth.kind === 'key') {
      try {
        connectConfig.privateKey = readFileSync(session.auth.privateKeyPath);
      } catch (e) {
        throw new Error(`Cannot read private key at ${session.auth.privateKeyPath}: ${String(e)}`);
      }
      if (session.auth.passphrase) {
        const pp = SessionManager.resolveSecret(session.auth.passphrase);
        if (pp) connectConfig.passphrase = pp;
      }
    } else if (session.auth.kind === 'agent') {
      connectConfig.agent = process.env['SSH_AUTH_SOCK'];
    }

    disconnectTab(tabId, false);
    const client = new Client();
    const size =
      options && validTerminalSize(options.cols, options.rows) ? options : { cols: 80, rows: 24 };
    tabs.set(tabId, {
      id: tabId,
      sessionId,
      client,
      cols: size.cols,
      rows: size.rows,
      connectionId: randomUUID(),
      ownerId,
    });
    sendStatus(tabId, 'connecting');

    const isCurrent = (): boolean => tabs.get(tabId)?.client === client;

    return new Promise<{ sftpAvailable: boolean; sftpMessage?: string }>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        const error = new Error('SSH shell startup timed out');
        rejectConnection(error);
        if (isCurrent()) {
          disconnectTab(tabId, false);
          sendStatus(tabId, 'error', error.message);
        }
      }, 25000);
      const resolveConnection = (result: {
        sftpAvailable: boolean;
        sftpMessage?: string;
      }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const rejectConnection = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };

      client.once('ready', () => {
        if (!isCurrent()) {
          rejectConnection(new Error('Connection cancelled'));
          return;
        }

        const sftpPromise = new Promise<{ sftpAvailable: boolean; sftpMessage?: string }>((res) => {
          let finished = false;
          const timer = setTimeout(() => {
            finished = true;
            res({
              sftpAvailable: false,
              sftpMessage: 'SFTP startup timed out; terminal remains available',
            });
          }, 10000);
          timer.unref();
          client.once('close', () => {
            clearTimeout(timer);
            finished = true;
            res({ sftpAvailable: false });
          });
          client.sftp((sftpErr, sftp) => {
            clearTimeout(timer);
            if (finished) {
              sftp?.end();
              return;
            }
            finished = true;
            const tab = tabs.get(tabId);
            if (!tab || tab.client !== client) {
              sftp?.end();
              res({ sftpAvailable: false, sftpMessage: 'Tab not found during SFTP setup' });
              return;
            }
            if (sftpErr) {
              logger.warn('sftp subsystem unavailable', { tabId, message: sftpErr.message });
              res({ sftpAvailable: false, sftpMessage: sftpErr.message });
            } else {
              tab.sftp = sftp;
              const unavailable = (error?: Error) => {
                if (!isCurrent() || tab.sftp !== sftp) return;
                tab.sftp = undefined;
                sendSftpStatus(tabId, false, error?.message ?? 'SFTP channel closed');
              };
              sftp.on('error', unavailable);
              sftp.on('close', () => unavailable());
              res({ sftpAvailable: true });
            }
          });
        });

        client.shell(
          { term: 'xterm-256color', cols: tabs.get(tabId)!.cols, rows: tabs.get(tabId)!.rows },
          (err, stream) => {
            if (!isCurrent()) {
              stream?.close();
              rejectConnection(new Error('Connection cancelled'));
              return;
            }
            if (err) {
              const tab = tabs.get(tabId);
              try {
                tab?.sftp?.end();
                client.end();
              } catch {
                // ignore
              }
              if (isCurrent()) tabs.delete(tabId);
              sendStatus(tabId, 'error', err.message);
              rejectConnection(err);
              return;
            }
            const tab = tabs.get(tabId)!;
            tab.channel = stream;
            stream.setWindow(tab.rows, tab.cols, 0, 0);
            tab.flow = new OutputFlow(
              () => {
                stream.pause();
                stream.stderr.pause();
              },
              () => {
                stream.resume();
                stream.stderr.resume();
              },
            );
            const stdout = new TerminalDecoder((cwd) => sendCwd(tabId, cwd));
            const stderr = new TerminalDecoder((cwd) => sendCwd(tabId, cwd));
            const emit = (decoder: TerminalDecoder, chunk: Buffer) => {
              if (!isCurrent()) return;
              const data = decoder.write(chunk);
              if (!data) return;
              const payload = { tabId, data, connectionId: tab.connectionId };
              const owner = tab.ownerId === undefined ? undefined : webContents.fromId(tab.ownerId);
              if (owner && !owner.isDestroyed()) {
                tab.flow!.sent(data.length);
                owner.send(Channels.Ssh.DataEvent, payload);
              }
            };
            stream.on('data', (chunk: Buffer) => emit(stdout, chunk));
            stream.stderr.on('data', (chunk: Buffer) => emit(stderr, chunk));
            stream.on('error', (error: Error) => {
              if (!isCurrent()) return;
              disconnectTab(tabId, false);
              sendStatus(tabId, 'error', error.message);
            });
            stream.on('close', () => {
              if (isCurrent()) disconnectTab(tabId);
            });
            if (options?.shellIntegration) stream.write(cwdIntegrationCommand(reconnectCwd));
            sendStatus(tabId, 'connected');
            // Shell readiness must not wait for an unavailable/hanging SFTP subsystem.
            resolveConnection({ sftpAvailable: false });
            void sftpPromise.then((sf) => {
              if (isCurrent()) sendSftpStatus(tabId, sf.sftpAvailable, sf.sftpMessage);
            });
          },
        );
      });

      // ssh2 may emit more than one error while a socket is being torn down
      // before handshake. Keep this listener for the client's full lifetime so
      // expected cancellation errors never become uncaught EventEmitter errors.
      client.on('error', (err) => {
        if (isCurrent()) {
          logger.error('ssh client error', { tabId, sessionId, message: err.message });
          sendStatus(tabId, 'error', err.message);
          disconnectTab(tabId, false);
        } else {
          logger.debug('ignored ssh error after tab closed or replaced', {
            tabId,
            sessionId,
            message: err.message,
          });
        }
        rejectConnection(err);
      });

      client.once('close', () => {
        if (isCurrent()) {
          sendStatus(tabId, 'closed');
          tabs.delete(tabId);
        }
        rejectConnection(new Error('Connection closed'));
      });

      try {
        client.connect(connectConfig);
      } catch (e) {
        if (isCurrent()) tabs.delete(tabId);
        const error = e instanceof Error ? e : new Error(String(e));
        sendStatus(tabId, 'error', error.message);
        rejectConnection(error);
      }
    });
  },

  async metrics(tabId: string, ownerId: number): Promise<RemoteMetrics> {
    const tab = tabs.get(tabId);
    if (!tab?.channel || tab.channel.destroyed || tab.ownerId !== ownerId)
      throw new Error('SSH connection unavailable');
    if (tab.metricsRequest) return tab.metricsRequest;
    if (tab.lastMetrics && Date.now() - tab.lastMetrics.sampledAt < 900) return tab.lastMetrics;
    tab.metricsRequest = readMetrics(tab.client)
      .then((output) => {
        if (tabs.get(tabId) !== tab) throw new Error('SSH connection changed');
        const result = parseMetrics(output, tab.cpuSample);
        tab.cpuSample = result.cpu;
        tab.lastMetrics = result.metrics;
        return result.metrics;
      })
      .finally(() => {
        tab.metricsRequest = undefined;
      });
    return tab.metricsRequest;
  },

  executeShortcut(tabId: string, sessionId: string | null, command: string, ownerId: number): void {
    const tab = tabs.get(tabId);
    if (!tab?.channel || tab.channel.destroyed || tab.ownerId !== ownerId)
      throw new Error('SSH disconnected / SSH 已断开');
    if (sessionId !== null && sessionId !== tab.sessionId)
      throw new Error('Shortcut belongs to another host / 指令不适用于此主机');
    tab.channel.write(command);
  },

  write(tabId: string, data: string): void {
    const tab = tabs.get(tabId);
    if (tab?.channel) tab.channel.write(data);
  },

  resize(tabId: string, cols: number, rows: number): void {
    const tab = tabs.get(tabId);
    if (!tab || !validTerminalSize(cols, rows)) return;
    tab.cols = cols;
    tab.rows = rows;
    if (tab.channel && !tab.channel.destroyed) tab.channel.setWindow(rows, cols, 0, 0);
  },

  acknowledge(tabId: string, connectionId: string, size: number, ownerId: number): void {
    const tab = tabs.get(tabId);
    if (tab?.connectionId === connectionId && tab.ownerId === ownerId) tab.flow?.acknowledge(size);
  },

  disconnect(tabId: string): void {
    disconnectTab(tabId);
  },

  disconnectOwner(ownerId: number): void {
    for (const [id, tab] of tabs) if (tab.ownerId === ownerId) disconnectTab(id);
  },

  disconnectAll(): void {
    for (const tabId of [...tabs.keys()]) disconnectTab(tabId);
  },

  async sftpList(tabId: string, remotePath: string): Promise<SftpListEntry[]> {
    const sftp = getSftp(tabId);
    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          reject(err);
          return;
        }
        const rows = (list ?? []).map(entryToListItem);
        rows.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        resolve(rows);
      });
    });
  },

  async sftpRealpath(tabId: string, remotePath: string): Promise<string> {
    const sftp = getSftp(tabId);
    return new Promise((resolve, reject) => {
      sftp.realpath(remotePath, (err, abs) => {
        if (err) reject(err);
        else resolve(abs);
      });
    });
  },

  async sftpMkdir(tabId: string, remotePath: string): Promise<void> {
    const sftp = getSftp(tabId);
    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  async sftpRemove(tabId: string, remotePath: string, kind: 'file' | 'directory'): Promise<void> {
    const sftp = getSftp(tabId);
    return new Promise((resolve, reject) => {
      const cb: (err: Error | null | undefined) => void = (err) => {
        if (err) reject(err);
        else resolve();
      };
      if (kind === 'directory') sftp.rmdir(remotePath, cb);
      else sftp.unlink(remotePath, cb);
    });
  },

  async sftpRename(tabId: string, fromPath: string, toPath: string): Promise<void> {
    const sftp = getSftp(tabId);
    return new Promise((resolve, reject) => {
      sftp.rename(fromPath, toPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  async sftpChmod(tabId: string, remotePath: string, mode: number): Promise<void> {
    const sftp = getSftp(tabId);
    return new Promise((resolve, reject) => {
      sftp.chmod(remotePath, mode, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  async sftpReadFile(tabId: string, remotePath: string): Promise<string> {
    return readRemoteText(getSftp(tabId), remotePath);
  },

  async sftpWriteFile(
    tabId: string,
    remotePath: string,
    content: string,
    expected: string,
  ): Promise<void> {
    return writeRemoteText(getSftp(tabId), remotePath, content, expected);
  },

  async sftpFastPut(
    tabId: string,
    localPath: string,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const sftp = getSftp(tabId);
    const expectedSize = statSync(localPath).size;
    return new Promise((resolve, reject) => {
      const opts =
        onProgress !== undefined
          ? {
              step: (_total: number, _chunk: number, fsize: number) => {
                onProgress(_total, fsize);
              },
            }
          : undefined;
      if (opts) {
        sftp.fastPut(localPath, remotePath, opts, (err) => {
          if (err) {
            reject(err);
            return;
          }
          assertRemoteFileSize(sftp, remotePath, expectedSize).then(resolve, reject);
        });
      } else {
        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) {
            reject(err);
            return;
          }
          assertRemoteFileSize(sftp, remotePath, expectedSize).then(resolve, reject);
        });
      }
    });
  },

  async sftpFastGet(
    tabId: string,
    remotePath: string,
    localPath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const sftp = getSftp(tabId);
    const expected = await sftpStat(sftp, remotePath);
    if (expected.isDirectory) throw new Error(`Remote path is a directory: ${remotePath}`);
    return new Promise((resolve, reject) => {
      const opts =
        onProgress !== undefined
          ? {
              step: (_total: number, _chunk: number, fsize: number) => {
                onProgress(_total, fsize);
              },
            }
          : undefined;
      if (opts) {
        sftp.fastGet(remotePath, localPath, opts, (err) => {
          if (err) {
            reject(err);
            return;
          }
          try {
            assertLocalFileSize(localPath, expected.size);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      } else {
        sftp.fastGet(remotePath, localPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
          try {
            assertLocalFileSize(localPath, expected.size);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      }
    });
  },

  async sftpDownloadRecursive(
    tabId: string,
    remotePath: string,
    localParentDir: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const sftp = getSftp(tabId);
    const rootName = basename(remotePath) || 'download';
    const targetRoot = pathJoin(localParentDir, rootName);
    const { files, dirs, symlinks } = await collectRemoteFiles(sftp, remotePath);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    let completed = 0;

    mkdirSync(targetRoot, { recursive: true });
    for (const dir of dirs) {
      mkdirSync(pathJoin(targetRoot, dir), { recursive: true });
    }
    for (const link of symlinks) {
      const localPath = pathJoin(targetRoot, link.relativePath);
      mkdirSync(pathJoin(localPath, '..'), { recursive: true });
      if (existsSync(localPath)) unlinkSync(localPath);
      symlinkSync(link.target, localPath);
    }

    for (const file of files) {
      const localPath = pathJoin(targetRoot, file.relativePath);
      mkdirSync(pathJoin(localPath, '..'), { recursive: true });
      await this.sftpFastGet(tabId, file.remotePath, localPath, (transferred) => {
        onProgress?.(completed + transferred, total);
      });
      completed += file.size;
      assertLocalFileSize(localPath, file.size);
      onProgress?.(completed, total);
    }
  },

  async sftpUploadRecursive(
    tabId: string,
    localPath: string,
    remoteDir: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const sftp = getSftp(tabId);
    const { files, dirs, isDirectory } = collectLocalFiles(localPath);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    let completed = 0;

    if (isDirectory) {
      for (const dir of dirs) {
        await sftpMkdirp(sftp, pathPosix.join(remoteDir, dir));
      }
    }

    for (const file of files) {
      const remotePath = pathPosix.join(remoteDir, file.relativePath);
      await sftpMkdirp(sftp, pathPosix.dirname(remotePath));
      await this.sftpFastPut(tabId, file.localPath, remotePath, (transferred) => {
        onProgress?.(completed + transferred, total);
      });
      completed += file.size;
      await assertRemoteFileSize(sftp, remotePath, file.size);
      onProgress?.(completed, total);
    }
  },

  async exec(
    tabId: string,
    command: string,
    stdin?: string,
  ): Promise<{ code: number | null; signal?: string; stdout: string; stderr: string }> {
    const tab = tabs.get(tabId);
    if (!tab?.client) throw new Error('SSH connection not available for this tab');
    return new Promise((resolve, reject) => {
      tab.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => stdout.push(chunk));
        stream.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
        if (stdin !== undefined) stream.end(stdin);
        stream.on('close', (code: number | null, signal?: string) => {
          resolve({
            code,
            signal,
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8'),
          });
        });
        stream.on('error', reject);
      });
    });
  },

  async createRemoteArchive(
    tabId: string,
    remotePath: string,
    format: 'zip' | 'tar.gz',
    sudoPassword?: string,
  ): Promise<{ remoteArchivePath: string; label: string; sudo: boolean }> {
    const archivePath = remoteArchivePath(remotePath, format);
    const command = archiveCommand(remotePath, archivePath, format);
    const sudo = Boolean(sudoPassword);
    const packedCommand = sudo
      ? sudoCommand(`${command} && chmod 0644 ${shellQuote(archivePath)}`)
      : command;
    const result = await this.exec(
      tabId,
      packedCommand,
      sudo ? `${sudoPassword ?? ''}\n` : undefined,
    );
    if (result.code !== 0) {
      const output = `${result.stderr || result.stdout}`.trim();
      throw new Error(
        output || `Archive command failed with exit code ${result.code ?? 'unknown'}`,
      );
    }
    return { remoteArchivePath: archivePath, label: archiveName(remotePath, format), sudo };
  },

  async removeRemoteFile(tabId: string, remotePath: string, sudoPassword?: string): Promise<void> {
    if (sudoPassword) {
      await this.exec(tabId, sudoCommand(`rm -f ${shellQuote(remotePath)}`), `${sudoPassword}\n`);
      return;
    }
    const sftp = getSftp(tabId);
    await new Promise<void>((resolve) => {
      sftp.unlink(remotePath, () => resolve());
    });
  },

  /** Resolve `name` (file/dir segment, `.`, or `..`) against remote `cwd`. */
  joinRemote(cwd: string, name: string): string {
    if (name === '..') {
      if (!cwd || cwd === '/') return '/';
      const parent = pathPosix.dirname(cwd);
      return parent === '' ? '/' : parent;
    }
    if (name === '.') return cwd || '.';
    const base = cwd || '.';
    return pathPosix.normalize(pathPosix.join(base, name));
  },
};
