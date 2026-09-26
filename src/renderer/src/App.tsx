import { useEffect } from 'react';
import { Terminal as TerminalIcon, ArrowUpRight, Server, FolderSync, Search } from 'lucide-react';
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

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openDialog(null);
      }
      if (event.key === 'F11') {
        event.preventDefault();
        void window.api.app.fullscreen();
      }
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault();
        const store = useTerminalStore.getState();
        const index = store.tabs.findIndex((tab) => tab.id === store.activeId);
        const next =
          store.tabs[(index + (event.shiftKey ? -1 : 1) + store.tabs.length) % store.tabs.length];
        if (next) store.setActive(next.id);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [openDialog]);

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
  const sessions = useSessionStore((s) => s.sessions);
  const openTab = useTerminalStore((s) => s.openTab);
  const zh = useSettingsStore((s) => s.language === 'zh');
  return (
    <div className="workspace-welcome flex min-h-0 flex-1 overflow-auto">
      <div className="m-auto w-full max-w-3xl px-12 py-14">
        <div className="mb-7 flex items-center gap-3 text-xs font-medium tracking-[0.18em] text-accent">
          <TerminalIcon className="h-5 w-5" /> SSH WORKSPACE
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {zh ? '连接，即刻开始。' : 'Connect. Make yourself at home.'}
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-text-muted">
          {zh
            ? '终端、远程文件和独立编辑器，在一个专注的工作空间中协同。'
            : 'Your terminal, remote files and editor, together in a focused workspace.'}
        </p>
        <button
          onClick={() => openDialog(null)}
          className="mt-7 flex items-center gap-3 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110"
        >
          {t('sidebar.newSession')}
          <ArrowUpRight className="h-4 w-4" />
        </button>
        {sessions.length > 0 ? (
          <div className="mt-10">
            <div className="mb-3 text-xs font-medium text-text-muted">
              {t('sidebar.sessions')} · {sessions.length}
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {sessions.slice(0, 6).map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    void openTab(session.id, session.name);
                    useUiStore.getState().setSidebarPanel('browser');
                  }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated/70 p-4 text-left transition hover:border-accent/60"
                >
                  <Server className="h-5 w-5 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{session.name}</div>
                    <div className="mt-1 truncate font-mono text-xs text-text-muted">
                      {session.username}@{session.host}
                    </div>
                  </div>
                  <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-text-muted" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-10 grid grid-cols-3 gap-5 border-t border-border pt-6 text-xs text-text-muted">
          <div>
            <TerminalIcon className="mb-3 h-4 w-4 text-accent" />
            {zh ? '切换终端' : 'Switch terminal'}
            <div className="mt-2 font-mono text-[11px]">Ctrl + Tab</div>
          </div>
          <div>
            <Search className="mb-3 h-4 w-4 text-accent" />
            {t('terminal.search')}
            <div className="mt-2 font-mono text-[11px]">Ctrl + Shift + F</div>
          </div>
          <div>
            <FolderSync className="mb-3 h-4 w-4 text-accent" />
            {zh ? '文件自动刷新' : 'Files stay in sync'}
            <div className="mt-2 text-[11px]">
              {zh ? '每 3 秒 · 当前目录' : 'Every 3s · current directory'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
