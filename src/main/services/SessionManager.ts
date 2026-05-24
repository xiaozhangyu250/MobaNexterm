import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import type { Session } from '@shared/types/session';
import type { NewSessionInput } from '@shared/types/ipc';
import { CredentialStore } from './CredentialStore';

interface SessionStoreSchema {
  sessions: Session[];
}

const store = new Store<SessionStoreSchema>({
  name: 'sessions',
  defaults: { sessions: [] },
});

function inputToSession(id: string, input: NewSessionInput, now: number): Session {
  const auth: Session['auth'] =
    input.authKind === 'key'
      ? {
          kind: 'key',
          privateKeyPath: input.privateKeyPath ?? '',
          passphrase: input.passphrase ? `cred:${id}:passphrase` : undefined,
        }
      : { kind: 'password', password: `cred:${id}:password` };

  return {
    id,
    name: input.name,
    groupId: input.groupId,
    protocol: 'ssh',
    host: input.host,
    port: input.port,
    username: input.username,
    auth,
    createdAt: now,
    updatedAt: now,
  };
}

export const SessionManager = {
  list(): Session[] {
    return store.get('sessions');
  },

  get(id: string): Session | undefined {
    return store.get('sessions').find((s) => s.id === id);
  },

  create(input: NewSessionInput): Session {
    const id = randomUUID();
    const now = Date.now();
    const session = inputToSession(id, input, now);

    if (input.authKind === 'password' && input.password) {
      CredentialStore.save(`${id}:password`, input.password);
    }
    if (input.authKind === 'key' && input.passphrase) {
      CredentialStore.save(`${id}:passphrase`, input.passphrase);
    }

    const sessions = [...store.get('sessions'), session];
    store.set('sessions', sessions);
    return session;
  },

  update(id: string, patch: Partial<NewSessionInput>): Session {
    const sessions = store.get('sessions');
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Session not found: ${id}`);

    const existing = sessions[idx];
    const now = Date.now();

    // Re-save secrets if provided.
    if (patch.password !== undefined) CredentialStore.save(`${id}:password`, patch.password);
    if (patch.passphrase !== undefined) CredentialStore.save(`${id}:passphrase`, patch.passphrase);

    const next: Session = {
      ...existing,
      name: patch.name ?? existing.name,
      host: patch.host ?? existing.host,
      port: patch.port ?? existing.port,
      username: patch.username ?? existing.username,
      groupId: patch.groupId ?? existing.groupId,
      updatedAt: now,
    };
    if (patch.authKind) {
      next.auth =
        patch.authKind === 'key'
          ? {
              kind: 'key',
              privateKeyPath: patch.privateKeyPath ?? '',
              passphrase: patch.passphrase ? `cred:${id}:passphrase` : undefined,
            }
          : { kind: 'password', password: `cred:${id}:password` };
    }

    sessions[idx] = next;
    store.set('sessions', sessions);
    return next;
  },

  remove(id: string): void {
    const sessions = store.get('sessions').filter((s) => s.id !== id);
    store.set('sessions', sessions);
    CredentialStore.remove(`${id}:password`);
    CredentialStore.remove(`${id}:passphrase`);
  },

  /** Resolve a credential ref (e.g. `cred:<id>:password`) to the plaintext secret. */
  resolveSecret(ref: string): string | null {
    if (!ref.startsWith('cred:')) return null;
    return CredentialStore.load(ref.slice('cred:'.length));
  },
};
