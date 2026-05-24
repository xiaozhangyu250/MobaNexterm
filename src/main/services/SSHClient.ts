import { Client, type ClientChannel, type SFTPWrapper, type FileEntryWithStats } from 'ssh2';
import { mkdirSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, join as pathJoin, posix as pathPosix } from 'node:path';
import { BrowserWindow } from 'electron';
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
  cwdBuffer?: string;
}

const tabs = new Map<string, Tab>();

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

function parseOsc7Cwd(tabId: string, chunk: string): void {
  const tab = tabs.get(tabId);
  if (!tab) return;
  const input = `${tab.cwdBuffer ?? ''}${chunk}`;
  const osc7 = /\x1b\]7;([^\x07\x1b]+)(?:\x07|\x1b\\)/g;
  let match: RegExpExecArray | null;
  while ((match = osc7.exec(input)) !== null) {
    const raw = match[1];
    try {
      const url = new URL(raw);
      if (url.protocol === 'file:' && url.pathname) {
        sendCwd(tabId, decodeURIComponent(url.pathname));
      }
    } catch {
      if (raw.startsWith('file://')) {
        const pathStart = raw.indexOf('/', 'file://'.length);
        if (pathStart !== -1) sendCwd(tabId, raw.slice(pathStart));
      }
    }
  }
  tab.cwdBuffer = input.slice(-512);
}

function installCwdHook(stream: ClientChannel): void {
  const script = [
    "__mnl_emit_cwd(){ printf '\\033]7;file://%s%s\\007' \"$(hostname 2>/dev/null || printf remote)\" \"$PWD\"; }",
    "if [ -n \"$ZSH_VERSION\" ]; then",
    "  eval 'precmd_functions+=(__mnl_emit_cwd)'",
    "elif [ -n \"$BASH_VERSION\" ]; then",
    "  PROMPT_COMMAND=\"__mnl_emit_cwd${PROMPT_COMMAND:+;$PROMPT_COMMAND}\"",
    "else",
    "  cd(){ command cd \"$@\" && __mnl_emit_cwd; }",
    "fi",
    '__mnl_emit_cwd',
  ].join('\n');

  setTimeout(() => {
    if (stream.destroyed) return;
    stream.write('stty -echo 2>/dev/null\n');
    setTimeout(() => {
      if (!stream.destroyed) stream.write(`${script}\nstty echo 2>/dev/null\n`);
    }, 60);
  }, 250);
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

function sftpMkdirp(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  const normalized = pathPosix.normalize(remotePath);
  const parts = normalized.split('/').filter(Boolean);
  let acc = normalized.startsWith('/') ? '/' : '.';

  return parts.reduce(
    (chain, part) =>
      chain.then(
        () =>
          new Promise<void>((resolve, reject) => {
            acc = acc === '/' ? `/${part}` : pathPosix.join(acc, part);
            sftp.mkdir(acc, (err) => {
              if (!err || /exists/i.test(err.message)) resolve();
              else reject(err);
            });
          }),
      ),
    Promise.resolve(),
  );
}

function sftpStat(sftp: SFTPWrapper, remotePath: string): Promise<{ isDirectory: boolean; size: number }> {
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

async function collectRemoteFiles(
  sftp: SFTPWrapper,
  remotePath: string,
  relativeBase = '',
): Promise<{ files: { remotePath: string; relativePath: string; size: number }[]; dirs: string[] }> {
  const stat = await sftpStat(sftp, remotePath);
  if (!stat.isDirectory) {
    return { files: [{ remotePath, relativePath: relativeBase || basename(remotePath), size: stat.size }], dirs: [] };
  }

  const entries = await new Promise<FileEntryWithStats[]>((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) reject(err);
      else resolve(list ?? []);
    });
  });
  const dirs = [relativeBase].filter(Boolean);
  const files: { remotePath: string; relativePath: string; size: number }[] = [];

  for (const entry of entries) {
    const item = entryToListItem(entry);
    const nextRemote = pathPosix.join(remotePath, entry.filename);
    const nextRelative = relativeBase ? pathPosix.join(relativeBase, entry.filename) : entry.filename;
    if (item.isDirectory) {
      const child = await collectRemoteFiles(sftp, nextRemote, nextRelative);
      dirs.push(...child.dirs);
      files.push(...child.files);
    } else if (!item.isSymlink) {
      files.push({ remotePath: nextRemote, relativePath: nextRelative, size: item.size });
    }
  }

  return { files, dirs };
}

function collectLocalFiles(
  localPath: string,
  relativeBase = basename(localPath),
): { files: { localPath: string; relativePath: string; size: number }[]; dirs: string[]; isDirectory: boolean } {
  const stat = statSync(localPath);
  if (!stat.isDirectory()) {
    return { files: [{ localPath, relativePath: relativeBase, size: stat.size }], dirs: [], isDirectory: false };
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

function disconnectTab(tabId: string): void {
  const tab = tabs.get(tabId);
  if (!tab) return;
  try {
    tab.sftp?.end();
    tab.channel?.close();
    tab.client.end();
  } catch (e) {
    logger.warn('error closing ssh tab', { tabId, error: String(e) });
  }
  tabs.delete(tabId);
  sendStatus(tabId, 'closed');
}

export const SSHClient = {
  async connect(sessionId: string): Promise<{
    tabId: string;
    sftpAvailable: boolean;
    sftpMessage?: string;
  }> {
    const session = SessionManager.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const tabId = randomUUID();
    const client = new Client();
    tabs.set(tabId, { id: tabId, sessionId, client });

    sendStatus(tabId, 'connecting');

    const connectConfig: Parameters<Client['connect']>[0] = {
      host: session.host,
      port: session.port,
      username: session.username,
      readyTimeout: 15000,
      keepaliveInterval: 30000,
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

    return new Promise<{ tabId: string; sftpAvailable: boolean; sftpMessage?: string }>((resolve, reject) => {
      client.once('ready', () => {
        const sftpPromise = new Promise<{ sftpAvailable: boolean; sftpMessage?: string }>((res) => {
          client.sftp((sftpErr, sftp) => {
            const tab = tabs.get(tabId);
            if (!tab) {
              res({ sftpAvailable: false, sftpMessage: 'Tab not found during SFTP setup' });
              return;
            }
            if (sftpErr) {
              logger.warn('sftp subsystem unavailable', { tabId, message: sftpErr.message });
              res({ sftpAvailable: false, sftpMessage: sftpErr.message });
            } else {
              tab.sftp = sftp;
              res({ sftpAvailable: true });
            }
          });
        });

        client.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
          if (err) {
            const tab = tabs.get(tabId);
            try {
              tab?.sftp?.end();
              client.end();
            } catch {
              // ignore
            }
            tabs.delete(tabId);
            sendStatus(tabId, 'error', err.message);
            reject(err);
            return;
          }
          void (async () => {
            const sf = await sftpPromise;
            const tab = tabs.get(tabId);
            if (tab) tab.channel = stream;
            stream.on('data', (chunk: Buffer) => {
              const data = chunk.toString('utf8');
              parseOsc7Cwd(tabId, data);
              send(Channels.Ssh.DataEvent, { tabId, data });
            });
            stream.stderr.on('data', (chunk: Buffer) => {
              const data = chunk.toString('utf8');
              parseOsc7Cwd(tabId, data);
              send(Channels.Ssh.DataEvent, { tabId, data });
            });
            stream.on('close', () => {
              sendStatus(tabId, 'closed');
              client.end();
              tabs.delete(tabId);
            });
            installCwdHook(stream);
            sendSftpStatus(tabId, sf.sftpAvailable, sf.sftpMessage);
            sendStatus(tabId, 'connected');
            resolve({ tabId, sftpAvailable: sf.sftpAvailable, sftpMessage: sf.sftpMessage });
          })();
        });
      });

      client.once('error', (err) => {
        logger.error('ssh client error', { tabId, sessionId, message: err.message });
        sendStatus(tabId, 'error', err.message);
        tabs.delete(tabId);
        reject(err);
      });

      client.once('close', () => {
        const t = tabs.get(tabId);
        if (t) {
          sendStatus(tabId, 'closed');
          tabs.delete(tabId);
        }
      });

      client.connect(connectConfig);
    });
  },

  write(tabId: string, data: string): void {
    const tab = tabs.get(tabId);
    if (tab?.channel) tab.channel.write(data);
  },

  resize(tabId: string, cols: number, rows: number): void {
    const tab = tabs.get(tabId);
    if (tab?.channel) tab.channel.setWindow(rows, cols, 0, 0);
  },

  disconnect(tabId: string): void {
    disconnectTab(tabId);
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

  async sftpFastPut(
    tabId: string,
    localPath: string,
    remotePath: string,
    onProgress?: (transferred: number, total: number) => void,
  ): Promise<void> {
    const sftp = getSftp(tabId);
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
          if (err) reject(err);
          else resolve();
        });
      } else {
        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) reject(err);
          else resolve();
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
          if (err) reject(err);
          else resolve();
        });
      } else {
        sftp.fastGet(remotePath, localPath, (err) => {
          if (err) reject(err);
          else resolve();
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
    const { files, dirs } = await collectRemoteFiles(sftp, remotePath);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    let completed = 0;

    mkdirSync(targetRoot, { recursive: true });
    for (const dir of dirs) {
      mkdirSync(pathJoin(targetRoot, dir), { recursive: true });
    }

    for (const file of files) {
      const localPath = pathJoin(targetRoot, file.relativePath);
      mkdirSync(pathJoin(localPath, '..'), { recursive: true });
      await this.sftpFastGet(tabId, file.remotePath, localPath, (transferred) => {
        onProgress?.(completed + transferred, total);
      });
      completed += file.size;
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
      onProgress?.(completed, total);
    }
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
