import { create } from 'zustand';

export type TabStatus = 'connecting' | 'connected' | 'closed' | 'error';

export interface TerminalTab {
  id: string;
  sessionId: string;
  title: string;
  status: TabStatus;
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
    try {
      const { tabId, sftpAvailable, sftpMessage } = await window.api.ssh.connect(sessionId);
      const tab: TerminalTab = {
        id: tabId,
        sessionId,
        title,
        status: 'connected',
        sftpAvailable,
        sftpMessage,
      };
      set({ tabs: [...get().tabs, tab], activeId: tabId });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('openTab failed', e);
      throw e;
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
