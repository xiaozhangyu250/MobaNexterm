import { Readable } from 'node:stream';
import type { SFTPWrapper } from 'ssh2';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_TEXT_BYTES,
  readRemoteText,
  writeRemoteText,
} from '../../src/main/services/remoteText';

function fixture(content = 'original') {
  const files = new Map<string, Buffer>([['/config', Buffer.from(content)]]);
  const attrs = (path: string) => ({
    size: files.get(path)?.length ?? 0,
    mode: 0o100640,
    uid: 1000,
    gid: 1000,
    isFile: () => true,
  });
  const sftp = {
    createReadStream: vi.fn((path: string) => Readable.from([files.get(path)!])),
    lstat: vi.fn((path: string, cb: (error: Error | null, value?: unknown) => void) =>
      cb(null, attrs(path)),
    ),
    stat: vi.fn((path: string, cb: (error: Error | null, value?: unknown) => void) =>
      cb(null, attrs(path)),
    ),
    writeFile: vi.fn(
      (
        path: string,
        data: Buffer,
        _options: unknown,
        cb: (error: Error | null, value?: unknown) => void,
      ) => {
        files.set(path, data);
        cb(null);
      },
    ),
    chmod: vi.fn(
      (_path: string, _mode: number, cb: (error: Error | null, value?: unknown) => void) =>
        cb(null),
    ),
    chown: vi.fn(
      (
        _path: string,
        _uid: number,
        _gid: number,
        cb: (error: Error | null, value?: unknown) => void,
      ) => cb(null),
    ),
    ext_openssh_rename: vi.fn(
      (from: string, to: string, cb: (error: Error | null, value?: unknown) => void) => {
        files.set(to, files.get(from)!);
        files.delete(from);
        cb(null);
      },
    ),
    unlink: vi.fn((path: string, cb: (error: Error | null, value?: unknown) => void) => {
      files.delete(path);
      cb(null);
    }),
  };
  return { sftp, api: sftp as unknown as SFTPWrapper, files };
}

describe('remote editor safety', () => {
  it('preserves UTF-8 BOM and CRLF without normalizing bytes', async () => {
    const f = fixture('\ufeff中文\r\n');
    expect(await readRemoteText(f.api, '/config')).toBe('\ufeff中文\r\n');
  });
  it('rejects binary and invalid UTF-8', async () => {
    const f = fixture();
    f.files.set('/config', Buffer.from([0]));
    await expect(readRemoteText(f.api, '/config')).rejects.toThrow('Binary');
    f.files.set('/config', Buffer.from([0xff]));
    await expect(readRemoteText(f.api, '/config')).rejects.toThrow('UTF-8');
  });
  it('enforces a streaming size limit even if the remote file grows', async () => {
    const f = fixture();
    f.files.set('/config', Buffer.alloc(MAX_TEXT_BYTES + 1, 65));
    await expect(readRemoteText(f.api, '/config')).rejects.toThrow('limit');
  });
  it('saves through an exclusive temporary file and preserves permissions', async () => {
    const f = fixture();
    await writeRemoteText(f.api, '/config', 'new', 'original');
    expect(f.files.get('/config')?.toString()).toBe('new');
    expect(f.files.size).toBe(1);
    expect(f.sftp.writeFile.mock.calls[0][2]).toEqual({ flag: 'wx', mode: 0o640 });
    expect(f.sftp.chmod.mock.calls[0][1]).toBe(0o640);
  });
  it('does not overwrite a file modified since opening', async () => {
    const f = fixture('someone else');
    await expect(writeRemoteText(f.api, '/config', 'mine', 'original')).rejects.toThrow(
      'Remote file changed',
    );
    expect(f.sftp.writeFile).not.toHaveBeenCalled();
    expect(f.files.get('/config')?.toString()).toBe('someone else');
  });
  it('retains original and cleans temporary file when atomic rename is unsupported', async () => {
    const f = fixture();
    f.sftp.ext_openssh_rename.mockImplementation((_a, _b, cb) => cb(new Error('unsupported')));
    await expect(writeRemoteText(f.api, '/config', 'mine', 'original')).rejects.toThrow(
      'unsupported',
    );
    expect(f.files.get('/config')?.toString()).toBe('original');
    expect(f.files.size).toBe(1);
  });
  it('rejects symlinks and concurrent saves', async () => {
    const f = fixture();
    const first = writeRemoteText(f.api, '/config', 'first', 'original');
    await expect(writeRemoteText(f.api, '/config', 'second', 'original')).rejects.toThrow(
      'in progress',
    );
    await first;
    f.sftp.lstat.mockImplementation((_p, cb) => cb(null, { isFile: () => false }));
    await expect(writeRemoteText(f.api, '/config', 'new', 'first')).rejects.toThrow(
      'regular files',
    );
  });
});
