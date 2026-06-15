import * as ContextMenu from '@radix-ui/react-context-menu';
import { Server, Pencil, Trash2, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useSessionStore } from '@/stores/sessionStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { useUiStore } from '@/stores/uiStore';
import type { Session } from '@shared/types/session';
import { cn } from '@/lib/utils';

export function SessionTree() {
  const t = useI18n();
  const sessions = useSessionStore((s) => s.sessions);

  if (sessions.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-text-muted">
        {t('session.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-2">
      {sessions.map((s) => (
        <SessionItem key={s.id} session={s} />
      ))}
    </div>
  );
}

function SessionItem({ session }: { session: Session }) {
  const t = useI18n();
  const openTab = useTerminalStore((s) => s.openTab);
  const remove = useSessionStore((s) => s.remove);
  const openDialog = useUiStore((s) => s.openSessionDialog);
  const setSidebarPanel = useUiStore((s) => s.setSidebarPanel);

  async function connect() {
    try {
      await openTab(session.id, session.name);
      setSidebarPanel('browser');
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          onDoubleClick={connect}
          className={cn(
            'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-text-muted',
            'transition hover:bg-bg-elevated hover:text-text',
          )}
        >
          <Server className="h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-text">{session.name}</div>
            <div className="truncate text-[10px] text-text-muted">
              {session.username}@{session.host}:{session.port}
            </div>
          </div>
          <Play
            className="h-3.5 w-3.5 shrink-0 cursor-pointer text-text-muted opacity-0 transition hover:text-accent group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              connect();
            }}
          />
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={cn(
            'z-50 min-w-[160px] rounded-md border border-border bg-bg-elevated p-1 text-xs text-text shadow-overlay',
          )}
        >
          <Item icon={<Play className="h-3.5 w-3.5" />} onClick={connect}>
            {t('session.connect')}
          </Item>
          <Item
            icon={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => openDialog(session)}
          >
            {t('session.edit')}
          </Item>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <Item
            icon={<Trash2 className="h-3.5 w-3.5" />}
            danger
            onClick={() => remove(session.id)}
          >
            {t('common.delete')}
          </Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function Item({
  icon,
  children,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <ContextMenu.Item
      onSelect={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none',
        'data-[highlighted]:bg-bg',
        danger && 'text-danger data-[highlighted]:bg-danger/10',
      )}
    >
      {icon}
      <span>{children}</span>
    </ContextMenu.Item>
  );
}
