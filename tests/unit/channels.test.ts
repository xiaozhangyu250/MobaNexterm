import { describe, expect, it } from 'vitest';
import { Channels } from '../../src/main/utils/channels';

describe('IPC channels', () => {
  it('uses unique channel names', () => {
    const names = Object.values(Channels).flatMap((group) => Object.values(group));

    expect(new Set(names).size).toBe(names.length);
  });
});
