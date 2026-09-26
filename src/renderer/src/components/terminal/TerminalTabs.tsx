import { X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTerminalStore, type TabStatus } from '@/stores/terminalStore';
import { Terminal } from './Terminal';
import { cn } from '@/lib/utils';

export function TerminalTabs() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeId = useTerminalStore((s) => s.activeId);
  const setActive = useTerminalStore((s) => s.setActive);
  const closeTab = useTerminalStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-9 shrink-0 items-end gap-px overflow-x-auto border-b border-border bg-bg-elevated/40 px-2 pt-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={cn(
              'group flex h-8 max-w-[200px] shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 text-xs transition',
              activeId === t.id
                ? 'border-border bg-bg text-text'
                : 'border-transparent bg-transparent text-text-muted hover:text-text',
            )}
          >
            <StatusDot status={t.status} />
            <span className="truncate">{t.title}</span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(t.id);
              }}
              className={cn(
                'rounded p-0.5 text-text-muted opacity-60 transition hover:bg-bg-elevated hover:text-text hover:opacity-100',
              )}
            >
              <X className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>

      <div className="relative min-h-0 flex-1">
        {tabs.map((t) => (
          <div
            key={t.id}
            aria-hidden={activeId !== t.id}
            className={cn(
              'absolute inset-0 flex min-h-0 flex-col',
              activeId === t.id ? 'visible' : 'invisible pointer-events-none',
            )}
          >
            <div className="min-h-0 flex-1">
              <Terminal tabId={t.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: TabStatus }) {
  if (status === 'connecting') return <Loader2 className="h-3 w-3 animate-spin text-text-muted" />;
  if (status === 'connected') return <CheckCircle2 className="h-3 w-3 text-success" />;
  if (status === 'error') return <AlertCircle className="h-3 w-3 text-danger" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />;
}
