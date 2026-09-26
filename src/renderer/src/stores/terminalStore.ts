import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';

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
  connectTab: (id: string, cols: number, rows: number) => Promise<void>;
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
  },

  async connectTab(id, cols, rows) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const attempt = tab.connectionAttempt;
    const settings = useSettingsStore.getState();
    try {
      await window.api.ssh.connect(
        tab.sessionId,
        id,
        settings.reconnectToLastDirectory ? tab.remoteCwd : undefined,
        { cols, rows, shellIntegration: settings.shellIntegration },
      );
      // Status and SFTP availability are authoritative backend events.
    } catch (e) {
      set({
        tabs: get().tabs.map((t) =>
          t.id === id && t.connectionAttempt === attempt
            ? { ...t, status: 'error', errorMessage: e instanceof Error ? e.message : String(e) }
            : t,
        ),
      });
    }
  },

  async reconnectTab(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || tab.status === 'connecting') return;
    const connectionAttempt = tab.connectionAttempt + 1;
    const reconnectCwd = useSettingsStore.getState().reconnectToLastDirectory
      ? tab.remoteCwd
      : undefined;

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
              remoteCwd: reconnectCwd,
            }
          : t,
      ),
      activeId: id,
    });
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
