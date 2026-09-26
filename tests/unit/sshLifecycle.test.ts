import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ clients: [] as MockClient[], send: vi.fn() }));
class MockChannel extends EventEmitter {
  stderr = new EventEmitter() as EventEmitter & {
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };
  destroyed = false;
  write = vi.fn();
  setWindow = vi.fn();
  pause = vi.fn();
  resume = vi.fn();
  close = vi.fn(() => {
    this.destroyed = true;
    this.emit('close');
  });
  constructor() {
    super();
    this.stderr.pause = vi.fn();
    this.stderr.resume = vi.fn();
  }
}
class MockClient extends EventEmitter {
  channel = new MockChannel();
  sftpCallback?: (err: Error | null, sftp?: { end: () => void }) => void;
  shell = vi.fn((_size, cb) => cb(null, this.channel));
  sftp = vi.fn((cb) => {
    this.sftpCallback = cb;
  });
  connect = vi.fn();
  end = vi.fn(() => this.emit('close'));
  constructor() {
    super();
    state.clients.push(this);
  }
}
vi.mock('ssh2', () => ({
  Client: class {
    constructor() {
      return new MockClient();
    }
  },
}));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: state.send } }] },
  webContents: { fromId: () => ({ isDestroyed: () => false, send: state.send }) },
}));
vi.mock('../../src/main/services/SessionManager', () => ({
  SessionManager: {
    get: () => ({
      host: 'test',
      port: 22,
      username: 'tester',
      auth: { kind: 'password', password: 'ref' },
    }),
    resolveSecret: () => 'test-password',
  },
}));
vi.mock('../../src/main/services/Logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
import { SSHClient } from '../../src/main/services/SSHClient';

beforeEach(() => {
  SSHClient.disconnectAll();
  state.clients.length = 0;
  state.send.mockClear();
});
afterEach(() => {
  SSHClient.disconnectAll();
  vi.useRealTimers();
});

describe('SSH lifecycle', () => {
  it('isolates an SFTP channel failure from the SSH terminal', async () => {
    const connected = SSHClient.connect('s', 'tab');
    const client = state.clients[0];
    client.emit('ready');
    await connected;
    const sftp = Object.assign(new EventEmitter(), { end: vi.fn() });
    client.sftpCallback?.(null, sftp);
    await Promise.resolve();
    sftp.emit('error', new Error('SFTP subsystem stopped'));
    expect(state.send).toHaveBeenCalledWith(
      'sftp:status',
      expect.objectContaining({ available: false, message: 'SFTP subsystem stopped' }),
    );
    expect(client.end).not.toHaveBeenCalled();
  });
  it('times out an authenticated server that never opens the requested shell', async () => {
    vi.useFakeTimers();
    const connected = SSHClient.connect('s', 'tab');
    const rejected = expect(connected).rejects.toThrow('timed out');
    state.clients[0].shell.mockImplementation(() => undefined);
    state.clients[0].emit('ready');
    await vi.advanceTimersByTimeAsync(25000);
    await rejected;
    expect(state.clients[0].end).toHaveBeenCalled();
  });
  it('reports SFTP timeout without closing the interactive terminal', async () => {
    vi.useFakeTimers();
    const connected = SSHClient.connect('s', 'tab');
    state.clients[0].emit('ready');
    await connected;
    await vi.advanceTimersByTimeAsync(10000);
    expect(state.send).toHaveBeenCalledWith(
      'sftp:status',
      expect.objectContaining({ available: false, message: expect.stringContaining('timed out') }),
    );
    expect(state.clients[0].end).not.toHaveBeenCalled();
  });
  it('starts a correctly sized terminal even when SFTP never replies, without injecting commands', async () => {
    const connected = SSHClient.connect('s', 'tab', undefined, { cols: 132, rows: 43 }, 1);
    const client = state.clients[0];
    client.emit('ready');
    await connected;
    expect(client.shell.mock.calls[0][0]).toEqual({ term: 'xterm-256color', cols: 132, rows: 43 });
    expect(client.channel.write).not.toHaveBeenCalled();
    expect(state.send).toHaveBeenCalledWith(
      'ssh:status',
      expect.objectContaining({ status: 'connected' }),
    );
  });
  it('uses the last resize while the connection is still negotiating', async () => {
    const connected = SSHClient.connect('s', 'tab', undefined, { cols: 80, rows: 24 }, 1);
    SSHClient.resize('tab', 160, 50);
    state.clients[0].emit('ready');
    await connected;
    expect(state.clients[0].channel.setWindow).toHaveBeenCalledWith(50, 160, 0, 0);
    SSHClient.resize('tab', NaN, 10);
    expect(state.clients[0].channel.setWindow).toHaveBeenCalledTimes(1);
  });
  it('handles split UTF-8 data and only the owner can acknowledge output', async () => {
    const connected = SSHClient.connect('s', 'tab', undefined, { cols: 80, rows: 24 }, 1);
    const client = state.clients[0];
    client.emit('ready');
    await connected;
    const data = Buffer.from('中文');
    client.channel.emit('data', data.subarray(0, 1));
    client.channel.emit('data', data.subarray(1));
    expect(state.send).toHaveBeenCalledWith('ssh:data', expect.objectContaining({ data: '中文' }));
    client.channel.emit('data', Buffer.alloc(300000, 65));
    expect(client.channel.pause).toHaveBeenCalledOnce();
    const payload = state.send.mock.calls.filter(([event]) => event === 'ssh:data').at(-1)![1];
    SSHClient.acknowledge('tab', payload.connectionId, 300000, 2);
    expect(client.channel.resume).not.toHaveBeenCalled();
    SSHClient.acknowledge('tab', payload.connectionId, 300000, 1);
    expect(client.channel.resume).toHaveBeenCalledOnce();
  });
  it('does not let stale disconnect/error/SFTP callbacks overwrite a reconnected tab', async () => {
    const first = SSHClient.connect('s', 'tab', undefined, { cols: 80, rows: 24 }, 1);
    const old = state.clients[0];
    old.emit('ready');
    await first;
    const second = SSHClient.connect('s', 'tab', undefined, { cols: 100, rows: 30 }, 1);
    const current = state.clients[1];
    current.emit('ready');
    await second;
    state.send.mockClear();
    old.emit('error', new Error('late'));
    old.emit('close');
    const end = vi.fn();
    old.sftpCallback?.(null, { end });
    await Promise.resolve();
    expect(end).toHaveBeenCalledOnce();
    expect(state.send).not.toHaveBeenCalled();
    SSHClient.write('tab', 'ls\r');
    expect(current.channel.write).toHaveBeenCalledWith('ls\r');
  });
  it('settles an in-flight connect on cancellation and tolerates multiple teardown errors', async () => {
    const connected = SSHClient.connect('s', 'tab');
    const rejected = expect(connected).rejects.toThrow('Connection closed');
    SSHClient.disconnect('tab');
    await rejected;
    expect(() => {
      state.clients[0].emit('error', new Error('cancel'));
      state.clients[0].emit('error', new Error('cancel'));
    }).not.toThrow();
  });
});
