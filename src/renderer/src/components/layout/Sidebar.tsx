import { type ReactNode } from 'react';
import { Folder, Plus, Server } from 'lucide-react';
import { SessionTree } from '@/components/session/SessionTree';
import { useI18n } from '@/lib/i18n';
import { useUiStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';

interface SidebarProps {
  sshBrowser: ReactNode;
}

export function Sidebar({ sshBrowser }: SidebarProps) {
  const t = useI18n();
  const openDialog = useUiStore((s) => s.openSessionDialog);
  const activePanel = useUiStore((s) => s.sidebarPanel);
  const setActivePanel = useUiStore((s) => s.setSidebarPanel);

  return (
    <aside className="flex w-[340px] min-w-[300px] shrink-0 flex-col border-r border-border bg-bg-elevated/30">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
        <PanelTab
          active={activePanel === 'sessions'}
          icon={<Server className="h-3.5 w-3.5" />}
          label={t('sidebar.sessions')}
          onClick={() => setActivePanel('sessions')}
        />
        <PanelTab
          active={activePanel === 'browser'}
          icon={<Folder className="h-3.5 w-3.5" />}
          label={t('sidebar.browser')}
          onClick={() => setActivePanel('browser')}
        />
        {activePanel === 'sessions' ? (
          <button
            type="button"
            onClick={() => openDialog(null)}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded text-text-muted transition hover:bg-bg hover:text-text"
            aria-label={t('sidebar.newSession')}
            title={t('sidebar.newSession')}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {activePanel === 'sessions' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 overflow-y-auto py-1">
              <SessionTree />
            </div>
            <div className="border-t border-border px-3 py-2 text-[10px] text-text-muted">
              {t('sidebar.connectHint')}
            </div>
          </div>
        ) : (
          sshBrowser
        )}
      </div>
    </aside>
  );
}

function PanelTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded px-2 text-xs transition',
        active ? 'bg-bg text-text' : 'text-text-muted hover:bg-bg/70 hover:text-text',
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
