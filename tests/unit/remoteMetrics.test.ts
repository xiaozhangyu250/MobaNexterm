import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { Client, ClientChannel } from 'ssh2';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { METRICS_COMMAND, parseMetrics, readMetrics } from '../../src/main/services/remoteMetrics';

function sample(cpu: string, memory = 'MemTotal: 1000 kB\nMemAvailable: 400 kB') {
  return `__MNL_STAT__\ncpu ${cpu}\n__MNL_MEM__\n${memory}\n__MNL_DISK__\nFilesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 1000 700 300 70% /\n__MNL_LOAD__\n0.12 0.2 0.3 1/100 45\n__MNL_END__\n`;
}
afterEach(() => vi.useRealTimers());
describe('remote Linux metrics', () => {
  it.skipIf(process.platform !== 'linux')('reads real Linux proc and filesystem statistics', () => {
    const result = spawnSync('sh', ['-c', METRICS_COMMAND], { encoding: 'utf8', timeout: 4000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const parsed = parseMetrics(result.stdout);
    expect(parsed.cpu?.total).toBeGreaterThan(0);
    expect(parsed.metrics.memory?.total).toBeGreaterThan(0);
    expect(parsed.metrics.disk?.total).toBeGreaterThan(0);
  });
  it('uses CPU deltas without double-counting guest time, available memory and root disk', () => {
    const first = parseMetrics(sample('100 0 50 850 0 0 0 0 80 0'));
    expect(first.metrics.cpuPercent).toBeNull();
    const next = parseMetrics(sample('130 0 60 910 0 0 0 0 110 0'), first.cpu);
    expect(next.metrics.cpuPercent).toBeCloseTo(40);
    expect(next.metrics.memory).toEqual({ used: 600 * 1024, total: 1000 * 1024, percent: 60 });
    expect(next.metrics.disk?.percent).toBe(70);
    expect(next.metrics.load1).toBe(0.12);
  });
  it('reports missing fields as unavailable and resets after counter rollback', () => {
    const { metrics } = parseMetrics(sample('1 0 0 9', 'MemTotal: 1000 kB'), {
      total: 100,
      idle: 80,
    });
    expect(metrics.cpuPercent).toBeNull();
    expect(metrics.memory).toBeNull();
    expect(() => parseMetrics('command not found')).toThrow('unavailable');
  });
  it('closes a timed-out channel and discards its late response', async () => {
    vi.useFakeTimers();
    const stream = Object.assign(new PassThrough(), { stderr: new PassThrough(), close: vi.fn() });
    const client = Object.assign(new EventEmitter(), {
      exec: vi.fn((_command, cb) => cb(null, stream)),
    });
    const result = readMetrics(client as unknown as Client);
    const rejected = expect(result).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(4001);
    await rejected;
    expect(stream.close).toHaveBeenCalledOnce();
    expect(client.listenerCount('close')).toBe(0);
    stream.emit('close');
  });
  it('bounds output and rejects a disconnected connection', async () => {
    const stream = Object.assign(new PassThrough(), { stderr: new PassThrough(), close: vi.fn() });
    const client = Object.assign(new EventEmitter(), {
      exec: vi.fn((_command, cb) => cb(null, stream)),
    });
    const pending = readMetrics(client as unknown as Client);
    const rejected = expect(pending).rejects.toThrow('too large');
    stream.emit('data', Buffer.alloc(65537));
    await rejected;
    const closed = readMetrics(client as unknown as Client);
    const disconnected = expect(closed).rejects.toThrow('disconnected');
    client.emit('close');
    await disconnected;
  });
  it('closes an exec channel arriving after timeout', async () => {
    vi.useFakeTimers();
    let accept!: (error: Error | null, stream: ClientChannel) => void;
    const client = Object.assign(new EventEmitter(), {
      exec: vi.fn((_command, cb) => {
        accept = cb;
      }),
    });
    const pending = readMetrics(client as unknown as Client);
    const rejected = expect(pending).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(4001);
    await rejected;
    const stream = { close: vi.fn() };
    accept(null, stream as unknown as ClientChannel);
    expect(stream.close).toHaveBeenCalledOnce();
  });
});
