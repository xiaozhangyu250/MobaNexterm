import type { Client, ClientChannel } from 'ssh2';
import type { RemoteMetrics } from '@shared/types/ipc';

// No PTY, sudo, installed agent or commands in the user's interactive terminal.
export const METRICS_COMMAND =
  "LC_ALL=C; export LC_ALL; printf '__MNL_STAT__\\n'; head -n 1 /proc/stat; printf '__MNL_MEM__\\n'; cat /proc/meminfo; printf '__MNL_DISK__\\n'; df -Pk /; printf '__MNL_LOAD__\\n'; cat /proc/loadavg; printf '__MNL_END__\\n'";
export interface CpuSample {
  total: number;
  idle: number;
}
export function parseMetrics(
  output: string,
  previous?: CpuSample,
): { metrics: RemoteMetrics; cpu?: CpuSample } {
  const section = (name: string, next: string) =>
    output.split(`__MNL_${name}__\n`)[1]?.split(`__MNL_${next}__`)[0] ?? '';
  const fields = section('STAT', 'MEM')
    .trim()
    .match(/^cpu\s+([\d\s]+)$/)?.[1]
    .trim()
    .split(/\s+/)
    .map(Number);
  // guest and guest_nice are already included in user/nice; exclude them from the total.
  const cpu =
    fields && fields.length >= 4
      ? { total: fields.slice(0, 8).reduce((a, b) => a + b, 0), idle: fields[3] + (fields[4] ?? 0) }
      : undefined;
  let cpuPercent: number | null = null;
  if (cpu && previous && cpu.total > previous.total && cpu.idle >= previous.idle)
    cpuPercent = Math.min(
      100,
      Math.max(0, 100 * (1 - (cpu.idle - previous.idle) / (cpu.total - previous.total))),
    );
  const mem = section('MEM', 'DISK');
  const memValue = (name: string) => {
    const m = mem.match(new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, 'm'));
    return m ? Number(m[1]) * 1024 : null;
  };
  const total = memValue('MemTotal');
  const available = memValue('MemAvailable');
  const disk = section('DISK', 'LOAD').trim().split('\n').at(-1)?.trim().split(/\s+/);
  const diskTotal = disk && disk.length >= 6 ? Number(disk[1]) * 1024 : NaN;
  const diskUsed = disk && disk.length >= 6 ? Number(disk[2]) * 1024 : NaN;
  const diskPercent = disk && disk.length >= 6 ? Number(disk[4].replace('%', '')) : NaN;
  const load = Number(section('LOAD', 'END').trim().split(/\s+/)[0] || NaN);
  if (!cpu && !total && !Number.isFinite(diskTotal))
    throw new Error('Linux metrics unavailable / 无法读取 Linux 性能数据');
  return {
    cpu,
    metrics: {
      sampledAt: Date.now(),
      cpuPercent,
      memory:
        total && available !== null
          ? {
              used: Math.max(0, total - available),
              total,
              percent: Math.max(0, Math.min(100, ((total - available) / total) * 100)),
            }
          : null,
      disk:
        diskTotal > 0 && Number.isFinite(diskUsed) && Number.isFinite(diskPercent)
          ? { used: diskUsed, total: diskTotal, percent: diskPercent }
          : null,
      load1: Number.isFinite(load) ? load : null,
    },
  };
}

export function readMetrics(client: Client): Promise<string> {
  return new Promise((resolve, reject) => {
    let channel: ClientChannel | undefined;
    let done = false;
    let output = '';
    let size = 0;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.off('close', closed);
      if (error) {
        channel?.close();
        reject(error);
      } else resolve(output);
    };
    const closed = () => finish(new Error('SSH disconnected / SSH 已断开'));
    const timer = setTimeout(() => finish(new Error('Metrics timeout / 性能采样超时')), 4000);
    client.once('close', closed);
    client.exec(METRICS_COMMAND, (error, stream) => {
      if (error) {
        finish(error);
        return;
      }
      channel = stream;
      if (done) {
        stream.close();
        return;
      }
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 65536) finish(new Error('Metrics response too large'));
        else output += chunk.toString('utf8');
      });
      stream.stderr.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 65536) finish(new Error('Metrics response too large'));
      });
      stream.once('error', finish);
      stream.once('close', () => finish());
    });
  });
}
