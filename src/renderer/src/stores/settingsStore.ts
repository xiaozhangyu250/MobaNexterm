import { create } from 'zustand';
import type { Language } from '@shared/types/ipc';

export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  theme: ThemeMode;
  language: Language;
  uiScale: number;
  terminalFontSize: number;
  reconnectToLastDirectory: boolean;
  shellIntegration: boolean;
}

interface SettingsState extends AppSettings {
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  setUiScale: (scale: number) => void;
  setTerminalFontSize: (size: number) => void;
  setReconnectToLastDirectory: (enabled: boolean) => void;
  setShellIntegration: (enabled: boolean) => void;
  reset: () => void;
}

const STORAGE_KEY = 'mobanexterm.settings';

export const defaultSettings: AppSettings = {
  theme: 'dark',
  language: navigator.language.startsWith('zh') ? 'zh' : 'en',
  uiScale: 100,
  terminalFontSize: 13,
  reconnectToLastDirectory: true,
  shellIntegration: true,
};

function readSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      shellIntegration: parsed.shellIntegration !== false,
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      language: parsed.language === 'zh' ? 'zh' : 'en',
      uiScale: clampNumber(parsed.uiScale, 80, 125, defaultSettings.uiScale),
      terminalFontSize: clampNumber(
        parsed.terminalFontSize,
        11,
        20,
        defaultSettings.terminalFontSize,
      ),
      reconnectToLastDirectory:
        typeof parsed.reconnectToLastDirectory === 'boolean'
          ? parsed.reconnectToLastDirectory
          : defaultSettings.reconnectToLastDirectory,
    };
  } catch {
    return defaultSettings;
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function persist(settings: AppSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...readSettings(),

  setTheme(theme) {
    const next = { ...get(), theme };
    persist(next);
    set({ theme });
  },

  setLanguage(language) {
    const next = { ...get(), language };
    persist(next);
    set({ language });
  },

  setUiScale(uiScale) {
    const nextScale = clampNumber(uiScale, 80, 125, defaultSettings.uiScale);
    const next = { ...get(), uiScale: nextScale };
    persist(next);
    set({ uiScale: nextScale });
  },

  setTerminalFontSize(terminalFontSize) {
    const nextSize = clampNumber(terminalFontSize, 11, 20, defaultSettings.terminalFontSize);
    const next = { ...get(), terminalFontSize: nextSize };
    persist(next);
    set({ terminalFontSize: nextSize });
  },

  setReconnectToLastDirectory(reconnectToLastDirectory) {
    const next = { ...get(), reconnectToLastDirectory };
    persist(next);
    set({ reconnectToLastDirectory });
  },

  setShellIntegration(shellIntegration) {
    persist({ ...get(), shellIntegration });
    set({ shellIntegration });
  },

  reset() {
    persist(defaultSettings);
    set(defaultSettings);
  },
}));
