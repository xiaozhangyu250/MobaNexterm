import { create } from 'zustand';
import type { Session } from '@shared/types/session';

export type SidebarPanel = 'sessions' | 'browser' | 'shortcuts';

interface UiState {
  sessionDialogOpen: boolean;
  sessionDialogEditing: Session | null;
  settingsDialogOpen: boolean;
  sidebarPanel: SidebarPanel;
  openSessionDialog: (editing?: Session | null) => void;
  closeSessionDialog: () => void;
  openSettingsDialog: () => void;
  closeSettingsDialog: () => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sessionDialogOpen: false,
  sessionDialogEditing: null,
  settingsDialogOpen: false,
  sidebarPanel: 'sessions',
  openSessionDialog: (editing = null) =>
    set({ sessionDialogOpen: true, sessionDialogEditing: editing }),
  closeSessionDialog: () => set({ sessionDialogOpen: false, sessionDialogEditing: null }),
  openSettingsDialog: () => set({ settingsDialogOpen: true }),
  closeSettingsDialog: () => set({ settingsDialogOpen: false }),
  setSidebarPanel: (panel) => set({ sidebarPanel: panel }),
}));
