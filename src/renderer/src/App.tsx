import { useEffect } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { Titlebar } from './components/layout/Titlebar';
import { Sidebar } from './components/layout/Sidebar';
import { Statusbar } from './components/layout/Statusbar';
import { SftpPanel } from './components/sftp/SftpPanel';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { SessionDialog } from './components/session/SessionDialog';
import { TerminalTabs } from './components/terminal/TerminalTabs';
import { useI18n } from './lib/i18n';
import { useSessionStore } from './stores/sessionStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTerminalStore } from './stores/terminalStore';
import { useUiStore } from './stores/uiStore';

export function App() {
  const loadSessions = useSessionStore((s) => s.load);
  const tabs = useTerminalStore((s) => s.tabs);
  const activeId = useTerminalStore((s) => s.activeId);
  const setStatus = useTerminalStore((s) => s.setStatus);
  const setSftpStatus = useTerminalStore((s) => s.setSftpStatus);
  const setRemoteCwd = useTerminalStore((s) => s.setRemoteCwd);
  const openDialog = useUiStore((s) => s.openSessionDialog);
  const openSettings = useUiStore((s) => s.openSettingsDialog);
  const theme = useSettingsStore((s) => s.theme);
  const language = useSettingsStore((s) => s.language);
  const uiScale = useSettingsStore((s) => s.uiScale);
  const activeTab = tabs.find((t) => t.id === activeId) ?? null;

  useEffect(() => {
    void loadSessions();

    // Mirror backend ssh:status events into the terminal store so tab dots stay in sync
    // even when no Terminal component is currently mounted for that tab.
    const offSsh = window.events.on('ssh:status', (p) => {
      setStatus(p.tabId, p.status, p.message);
    });
    const offSftp = window.events.on('sftp:status', (p) => {
      setSftpStatus(p.tabId, p.available, p.message);
    });
    const offCwd = window.events.on('ssh:cwd', (p) => {
      setRemoteCwd(p.tabId, p.cwd);
    });
    return () => {
      offSsh();
      offSftp();
      offCwd();
    };
  }, [loadSessions, setRemoteCwd, setStatus, setSftpStatus]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  useEffect(() => {
    document.body.style.removeProperty('zoom');
    window.api.app.setZoomFactor(uiScale / 100);
  }, [uiScale]);

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <Titlebar onOpenQuickConnect={() => openDialog(null)} onOpenSettings={openSettings} />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          sshBrowser={
            <SftpPanel
              tabId={activeTab?.id}
              connected={activeTab?.status === 'connected'}
              sftpAvailable={activeTab?.sftpAvailable === true}
              sftpMessage={activeTab?.sftpMessage}
              remoteCwd={activeTab?.remoteCwd}
            />
          }
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {tabs.length === 0 ? <EmptyState /> : <TerminalTabs />}
        </main>
      </div>
      <Statusbar />
      <SessionDialog />
      <SettingsDialog />
    </div>
  );
}

function EmptyState() {
  const t = useI18n();
  const openDialog = useUiStore((s) => s.openSessionDialog);
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-4 px-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-bg-elevated">
          <TerminalIcon className="h-6 w-6 text-text-muted" />
        </div>
        <div>
          <h1 className="text-base font-medium text-text">{t('empty.title')}</h1>
          <p className="mt-1 text-xs text-text-muted">{t('empty.body')}</p>
        </div>
        <button
          type="button"
          onClick={() => openDialog(null)}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
        >
          {t('sidebar.newSession')}
        </button>
      </div>
    </div>
  );
}
