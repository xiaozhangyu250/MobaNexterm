import { describe, expect, it, vi } from 'vitest';
import { DirectoryRequests } from '../../src/renderer/src/lib/directoryRequests';
describe('directory refresh coordination', () => {
  it('deduplicates overlapping polling/manual requests', async () => {
    const requests = new DirectoryRequests();
    const fetch = vi.fn(async () => ['new']);
    const apply = vi.fn();
    await Promise.all([
      requests.run('/', fetch, apply, vi.fn()),
      requests.run('/', fetch, apply, vi.fn()),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(['new']);
  });
  it('discards late results from a previous session and permits new requests', async () => {
    const requests = new DirectoryRequests();
    const apply = vi.fn();
    let resolve!: (v: string) => void;
    const old = requests.run(
      '/',
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
      apply,
      vi.fn(),
    );
    await Promise.resolve();
    requests.reset();
    await requests.run('/', async () => 'new session', apply, vi.fn());
    resolve('old session');
    await old;
    expect(apply.mock.calls).toEqual([['new session']]);
  });
  it('reports a refresh failure and allows retry without replacing cached entries', async () => {
    const requests = new DirectoryRequests();
    const apply = vi.fn();
    const fail = vi.fn();
    await requests.run(
      '/',
      async () => {
        throw new Error('offline');
      },
      apply,
      fail,
    );
    expect(apply).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
    await requests.run('/', async () => [], apply, fail);
    expect(apply).toHaveBeenCalledWith([]);
  });
});
