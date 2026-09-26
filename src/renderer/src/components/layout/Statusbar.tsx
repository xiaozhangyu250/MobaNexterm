import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useTerminalStore } from '@/stores/terminalStore';
import { useSessionStore } from '@/stores/sessionStore';
import { cn } from '@/lib/utils';

export function Statusbar() {
  const t = useI18n();
  const [version, setVersion] = useState('');
  const tab = useTerminalStore((s) => s.tabs.find((tab) => tab.id === s.activeId));
  const session = useSessionStore((s) => s.sessions.find((s) => s.id === tab?.sessionId));
  useEffect(() => {
    void window.api.app.getVersion().then(setVersion);
  }, []);
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-bg-elevated/40 px-4 text-[11px] text-text-muted">
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            tab?.status === 'connected'
              ? 'bg-success'
              : tab?.status === 'error'
                ? 'bg-danger'
                : 'bg-text-muted',
          )}
        />
        {tab ? t(`status.${tab.status}`) : t('status.ready')}
      </span>
      {session ? (
        <span className="truncate font-mono">
          {session.username}@{session.host}:{session.port}
        </span>
      ) : null}
      <span className="ml-auto truncate">{tab?.remoteCwd}</span>
      <span className="shrink-0">UTF-8 · xterm-256color</span>
      <span className="shrink-0">v{version}</span>
    </footer>
  );
}
