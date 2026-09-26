import type { SFTPWrapper, Stats } from 'ssh2';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';

export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const locks = new WeakMap<SFTPWrapper, Set<string>>();

export async function readRemoteText(sftp: SFTPWrapper, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const stream = sftp.createReadStream(path);
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_TEXT_BYTES) {
        stream.destroy(new Error('File exceeds the 2 MiB editor limit'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      const data = Buffer.concat(chunks);
      if (data.includes(0)) {
        reject(new Error('Binary file cannot be edited'));
        return;
      }
      try {
        resolve(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data));
      } catch {
        reject(
          new Error('File is not valid UTF-8; use an external editor to preserve its encoding'),
        );
      }
    });
  });
}

/** Fail closed: never truncate the original when atomic replacement is unavailable. */
export async function writeRemoteText(
  sftp: SFTPWrapper,
  path: string,
  content: string,
  expected: string,
): Promise<void> {
  if (typeof expected !== 'string')
    throw new Error('Original content is required for conflict detection');
  const data = Buffer.from(content, 'utf8');
  if (data.length > MAX_TEXT_BYTES) throw new Error('File exceeds the 2 MiB editor limit');
  let paths = locks.get(sftp);
  if (!paths) {
    paths = new Set();
    locks.set(sftp, paths);
  }
  if (paths.has(path)) throw new Error('A save is already in progress for this file');
  paths.add(path);
  const temp = posix.join(posix.dirname(path), `.mobanexterm-${randomUUID()}.tmp`);
  const call = (fn: (cb: (err?: Error | null) => void) => void) =>
    new Promise<void>((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));
  let created = false;
  try {
    const attrs = await new Promise<Stats>((resolve, reject) =>
      sftp.lstat(path, (err, stat) => (err ? reject(err) : resolve(stat))),
    );
    if (!attrs.isFile()) throw new Error('Only regular files can be saved safely');
    if ((await readRemoteText(sftp, path)) !== expected)
      throw new Error(
        'Remote file changed. Reopen it and merge your changes before saving. / 远端文件已更改，请重新打开并合并修改。',
      );
    // Mark before write, so partial temporary files are cleaned up on errors too.
    created = true;
    await call((cb) => sftp.writeFile(temp, data, { flag: 'wx', mode: attrs.mode & 0o777 }, cb));
    // Preserve ownership and permissions, or refuse the save instead of silently changing them.
    const tempAttrs = await new Promise<Stats>((resolve, reject) =>
      sftp.stat(temp, (err, stat) => (err ? reject(err) : resolve(stat))),
    );
    if (tempAttrs.uid !== attrs.uid || tempAttrs.gid !== attrs.gid)
      await call((cb) => sftp.chown(temp, attrs.uid, attrs.gid, cb));
    await call((cb) => sftp.chmod(temp, attrs.mode & 0o7777, cb));
    if (tempAttrs.size !== data.length) throw new Error('Incomplete remote write');
    if ((await readRemoteText(sftp, path)) !== expected)
      throw new Error('Remote file changed during save; original was not overwritten');
    try {
      await call((cb) => sftp.ext_openssh_rename(temp, path, cb));
    } catch (error) {
      if (error instanceof Error && /does not support/.test(error.message))
        throw new Error(
          'Server does not support atomic save. Original file is unchanged. / 服务器不支持原子保存，原文件未被覆盖。',
        );
      throw error;
    }
    created = false;
  } finally {
    if (created) await call((cb) => sftp.unlink(temp, cb)).catch(() => undefined);
    paths.delete(path);
  }
}
