import { describe, expect, it } from 'vitest';
import {
  joinRemote,
  posixDirname,
  posixJoin,
  posixNormalize,
} from '../../src/renderer/src/lib/remotePath';

describe('remote POSIX paths', () => {
  it('keeps children of the filesystem root absolute', () => {
    expect(posixJoin('/', 'etc')).toBe('/etc');
    expect(joinRemote('/', 'var')).toBe('/var');
  });

  it('joins children below other absolute directories', () => {
    expect(joinRemote('/dobot', 'logs')).toBe('/dobot/logs');
    expect(joinRemote('/dobot/', './logs')).toBe('/dobot/logs');
  });

  it('normalizes parent traversal without escaping the root', () => {
    expect(posixNormalize('/etc/../var')).toBe('/var');
    expect(joinRemote('/dobot/logs', '..')).toBe('/dobot');
    expect(joinRemote('/', '..')).toBe('/');
  });

  it('handles directory names and absolute child paths', () => {
    expect(posixDirname('/etc/ssh')).toBe('/etc');
    expect(posixDirname('/etc')).toBe('/');
    expect(posixJoin('/dobot', '/root')).toBe('/root');
  });
});
