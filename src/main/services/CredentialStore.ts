import { safeStorage } from 'electron';
import Store from 'electron-store';
import { logger } from './Logger';

interface CredStoreSchema {
  // ref id → base64-encoded encrypted secret
  secrets: Record<string, string>;
}

const store = new Store<CredStoreSchema>({
  name: 'credentials',
  defaults: { secrets: {} },
});

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export const CredentialStore = {
  /** Persist secret, return opaque ref id. */
  save(ref: string, secret: string): void {
    if (canEncrypt()) {
      const enc = safeStorage.encryptString(secret).toString('base64');
      const secrets = store.get('secrets');
      secrets[ref] = `enc:${enc}`;
      store.set('secrets', secrets);
    } else {
      logger.warn('safeStorage unavailable — falling back to plaintext storage');
      const secrets = store.get('secrets');
      secrets[ref] = `plain:${Buffer.from(secret).toString('base64')}`;
      store.set('secrets', secrets);
    }
  },

  load(ref: string): string | null {
    const secrets = store.get('secrets');
    const raw = secrets[ref];
    if (!raw) return null;
    if (raw.startsWith('enc:') && canEncrypt()) {
      try {
        return safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'));
      } catch (e) {
        logger.error('failed to decrypt secret', { ref, error: String(e) });
        return null;
      }
    }
    if (raw.startsWith('plain:')) {
      return Buffer.from(raw.slice(6), 'base64').toString('utf8');
    }
    return null;
  },

  remove(ref: string): void {
    const secrets = store.get('secrets');
    delete secrets[ref];
    store.set('secrets', secrets);
  },
};
