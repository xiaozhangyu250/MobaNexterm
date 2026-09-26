import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('navigator', { language: 'en' });
});
afterEach(() => vi.unstubAllGlobals());
async function readSettings(saved: Record<string, unknown> | null) {
  vi.stubGlobal('window', {
    localStorage: { getItem: () => (saved ? JSON.stringify(saved) : null), setItem: vi.fn() },
  });
  const { useSettingsStore } = await import('../../src/renderer/src/stores/settingsStore');
  return useSettingsStore.getState();
}
describe('directory integration settings', () => {
  it('enables directory integration for a new profile', async () => {
    expect((await readSettings(null)).shellIntegration).toBe(true);
  });
  it('enables integration when upgrading settings that lack the new preference', async () => {
    expect((await readSettings({ language: 'zh', uiScale: 110 })).shellIntegration).toBe(true);
  });
  it('respects a saved opt-out', async () => {
    expect((await readSettings({ shellIntegration: false })).shellIntegration).toBe(false);
  });
});
