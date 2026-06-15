import { create } from 'zustand';

export type TabStatus = 'connecting' | 'connected' | 'closed' | 'error';

export interface TerminalTab {
  id: string;
  sessionId: string;
  title: string;
  status: TabStatus;
  connectionAttempt: number;
  errorMessage?: string;
  /** SFTP subsystem opened successfully for this connection. */
  sftpAvailable?: boolean;
  sftpMessage?: string;
  remoteCwd?: string;
}

interface TerminalState {
  tabs: TerminalTab[];
  activeId: string | null;
  openTab: (sessionId: string, title: string) => Promise<void>;
  reconnectTab: (id: string) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  setActive: (id: string) => void;
  setStatus: (id: string, status: TabStatus, message?: string) => void;
  setSftpStatus: (id: string, available: boolean, message?: string) => void;
  setRemoteCwd: (id: string, cwd: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeId: null,

  async openTab(sessionId, title) {
    const tabId = crypto.randomUUID();
    const tab: TerminalTab = {
      id: tabId,
      sessionId,
      title,
      status: 'connecting',
      connectionAttempt: 1,
    };
    set({ tabs: [...get().tabs, tab], activeId: tabId });

    try {
      const { sftpAvailable, sftpMessage } = await window.api.ssh.connect(sessionId, tabId);
      set({
        tabs: get().tabs.map((t) =>
          t.id === tabId && t.connectionAttempt === 1
            ? { ...t, status: 'connected', sftpAvailable, sftpMessage, errorMessage: undefined }
            : t,
        ),
      });
    } catch (e) {
      console.error('openTab failed', e);
      const message = e instanceof Error ? e.message : String(e);
      set({
        tabs: get().tabs.map((t) =>
          t.id === tabId && t.connectionAttempt === 1
            ? { ...t, status: 'error', errorMessage: message }
            : t,
        ),
      });
    }
  },

  async reconnectTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.status === 'connecting') return;
    const connectionAttempt = tab.connectionAttempt + 1;

    set({
      tabs: get().tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'connecting',
              connectionAttempt,
              errorMessage: undefined,
              sftpAvailable: undefined,
              sftpMessage: undefined,
              remoteCwd: undefined,
            }
          : t,
      ),
      activeId: id,
    });

    try {
      const { sftpAvailable, sftpMessage } = await window.api.ssh.connect(tab.sessionId, id);
      set({
        tabs: get().tabs.map((t) =>
          t.id === id && t.connectionAttempt === connectionAttempt
            ? { ...t, status: 'connected', sftpAvailable, sftpMessage, errorMessage: undefined }
            : t,
        ),
      });
    } catch (e) {
      console.error('reconnectTab failed', e);
      const message = e instanceof Error ? e.message : String(e);
      set({
        tabs: get().tabs.map((t) =>
          t.id === id && t.connectionAttempt === connectionAttempt
            ? { ...t, status: 'error', errorMessage: message }
            : t,
        ),
      });
    }
  },

  async closeTab(id) {
    try {
      await window.api.ssh.disconnect(id);
    } catch {
      // ignore
    }
    const tabs = get().tabs.filter((t) => t.id !== id);
    const activeId =
      get().activeId === id ? (tabs.length > 0 ? tabs[tabs.length - 1].id : null) : get().activeId;
    set({ tabs, activeId });
  },

  setActive(id) {
    set({ activeId: id });
  },

  setStatus(id, status, message) {
    set({
      tabs: get().tabs.map((t) => (t.id === id ? { ...t, status, errorMessage: message } : t)),
    });
  },

  setSftpStatus(id, available, message) {
    set({
      tabs: get().tabs.map((t) =>
        t.id === id ? { ...t, sftpAvailable: available, sftpMessage: message } : t,
      ),
    });
  },

  setRemoteCwd(id, cwd) {
    set({
      tabs: get().tabs.map((t) => (t.id === id ? { ...t, remoteCwd: cwd } : t)),
    });
  },
}));
