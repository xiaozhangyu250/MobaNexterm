const { Server } = require('ssh2');
const { generateKeyPairSync } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/** Disposable loopback SSH/SFTP server. No user credentials or real remote files. */
async function startFixture({ realShell = false } = {}) {
  const home = realShell ? fs.mkdtempSync(path.join(os.tmpdir(), 'mnl-bash-e2e-')) : '/workspace';
  const processes = new Set();
  const listedPaths = [];
  const monitor = { calls: 0, fail: false };
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const files = new Map([[`${home}/config.txt`, Buffer.from('hello world\nhello SSH\n中文配置\n')]]);
  const clients = new Set();
  const shells = [];
  const sizes = [];
  const input = [];
  const server = new Server({ hostKeys: [privateKey.export({ type: 'pkcs1', format: 'pem' })] }, (client) => {
    clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client));
    client.on('authentication', (ctx) => ctx.method === 'password' && ctx.username === 'tester' && ctx.password === 'fixture-only' ? ctx.accept() : ctx.reject());
    client.on('ready', () => client.on('session', (accept) => {
      const session = accept();
      session.on('pty', (accept, _reject, info) => { sizes.push(info); accept(); });
      session.on('window-change', (accept, _reject, info) => { sizes.push(info); accept?.(); });
      session.on('exec', (accept, reject, info) => {
        if (!info.command.includes('__MNL_STAT__')) { reject(); return; }
        const stream = accept(); const n = ++monitor.calls;
        if (monitor.fail) { stream.stderr.write('permission denied'); stream.exit(1); stream.end(); return; }
        stream.write(`__MNL_STAT__\ncpu ${100 + 30*n} 0 ${50 + 10*n} ${850 + 60*n} 0 0 0 0\n__MNL_MEM__\nMemTotal: 1000000 kB\nMemAvailable: 400000 kB\n__MNL_DISK__\nFilesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 1000000 700000 300000 70% /\n__MNL_LOAD__\n0.12 0.2 0.3 1/100 45\n__MNL_END__\n`);
        stream.exit(0); stream.end();
      });
      session.on('shell', (accept) => {
        const stream = accept(); shells.push(stream);
        if (realShell) {
          const child = spawn('bash', ['--noprofile', '--norc', '-i'], {
            cwd: home, env: { PATH: process.env.PATH, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', HOME: home, HISTFILE: '/dev/null', TERM: 'xterm-256color', PS1: 'fixture> ' },
          });
          processes.add(child);
          child.stdout.on('data', (data) => { if (!stream.destroyed) stream.write(data.toString().replace(/\r?\n/g, '\r\n')); });
          child.stderr.on('data', (data) => { if (!stream.destroyed) stream.write(data.toString().replace(/\r?\n/g, '\r\n')); });
          child.stdin.on('error', () => {});
          child.on('error', () => stream.close());
          child.on('exit', () => { processes.delete(child); stream.close(); });
          stream.on('data', (chunk) => { input.push(chunk.toString()); child.stdin.write(chunk.toString().replaceAll('\r', '\n')); });
          stream.on('close', () => child.kill('SIGKILL'));
          return;
        }
        const text = Buffer.from('\x1b[32mConnected · 中文测试\x1b[0m\r\n\x1b]7;file://fixture/workspace\x07tester@fixture:~$ ');
        stream.write(text.subarray(0, 22)); stream.write(text.subarray(22));
        stream.on('data', (chunk) => { input.push(chunk.toString()); stream.write(chunk); });
      });
      session.on('sftp', (accept) => {
        const sftp = accept(); const handles = new Map(); let next = 0;
        const attrs = (name) => ({ mode: name === home ? 0o40755 : 0o100644, uid: 1000, gid: 1000, size: files.get(name)?.length ?? 0, atime: 1000, mtime: 1000 });
        const handle = (id, entry) => { const h = Buffer.from(String(++next)); handles.set(h.toString(), entry); sftp.handle(id, h); };
        sftp.on('REALPATH', (id) => sftp.name(id, [{ filename: home, longname: home, attrs: attrs(home) }]));
        sftp.on('OPENDIR', (id, directory) => { listedPaths.push(directory); handle(id, { directory, read: false }); });
        sftp.on('READDIR', (id, h) => {
          const entry = handles.get(h.toString());
          if (entry.read) return sftp.status(id, 1);
          entry.read = true;
          sftp.name(id, [...files.keys()].filter((p) => !p.includes('.mobanexterm-') && (!realShell || path.dirname(p) === entry.directory)).map((p) => ({ filename: p.split('/').at(-1), longname: p, attrs: attrs(p) })));
        });
        const stat = (id, p) => files.has(p) || p === home ? sftp.attrs(id, attrs(p)) : sftp.status(id, 2);
        sftp.on('STAT', stat).on('LSTAT', stat);
        sftp.on('FSTAT', (id, h) => stat(id, handles.get(h.toString()).path));
        sftp.on('OPEN', (id, p, flags) => {
          if (flags & 2) files.set(p, Buffer.alloc(0));
          if (!files.has(p)) return sftp.status(id, 2);
          handle(id, { path: p });
        });
        sftp.on('READ', (id, h, offset, length) => {
          const data = files.get(handles.get(h.toString()).path);
          if (offset >= data.length) sftp.status(id, 1);
          else sftp.data(id, data.subarray(offset, offset + length));
        });
        sftp.on('WRITE', (id, h, offset, data) => {
          const p = handles.get(h.toString()).path; const previous = files.get(p);
          const buffer = Buffer.alloc(Math.max(previous.length, offset + data.length)); previous.copy(buffer); data.copy(buffer, offset); files.set(p, buffer); sftp.status(id, 0);
        });
        sftp.on('SETSTAT', (id) => sftp.status(id, 0));
        sftp.on('FSETSTAT', (id) => sftp.status(id, 0));
        sftp.on('CLOSE', (id, h) => { handles.delete(h.toString()); sftp.status(id, 0); });
        sftp.on('REMOVE', (id, p) => { files.delete(p); sftp.status(id, 0); });
      });
    }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { home, listedPaths, monitor, port: server.address().port, files, shells, sizes, input, close: () => { for (const client of clients) client.end(); server.close(); for (const child of processes) child.kill('SIGKILL'); if (realShell) fs.rmSync(home, { recursive: true, force: true }); } };
}
module.exports = { startFixture };
