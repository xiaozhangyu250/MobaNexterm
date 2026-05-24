import { create } from 'zustand';
import type { Session } from '@shared/types/session';
import type { NewSessionInput } from '@shared/types/ipc';

interface SessionState {
  sessions: Session[];
  loading: boolean;
  load: () => Promise<void>;
  create: (input: NewSessionInput) => Promise<Session>;
  update: (id: string, patch: Partial<NewSessionInput>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  loading: false,

  async load() {
    set({ loading: true });
    const sessions = await window.api.session.list();
    set({ sessions, loading: false });
  },

  async create(input) {
    const created = await window.api.session.create(input);
    set({ sessions: [...get().sessions, created] });
    return created;
  },

  async update(id, patch) {
    const updated = await window.api.session.update(id, patch);
    set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)) });
  },

  async remove(id) {
    await window.api.session.remove(id);
    set({ sessions: get().sessions.filter((s) => s.id !== id) });
  },
}));
