import { useEffect, useState } from 'react';
import { Maximize2, Minus, Search, Settings, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import iconUrl from '@/assets/icon.png';

interface TitlebarProps {
  onOpenQuickConnect?: () => void;
  onOpenSettings?: () => void;
}

export function Titlebar({ onOpenQuickConnect, onOpenSettings }: TitlebarProps) {
  const t = useI18n();
  const [platform, setPlatform] = useState<NodeJS.Platform | null>(null);

  useEffect(() => {
    window.api.app.getPlatform().then(setPlatform);
  }, []);

  const isMac = platform === 'darwin';

  return (
    <div
      className={cn(
        'titlebar-drag flex h-9 shrink-0 items-center gap-3 border-b border-border bg-bg-overlay px-3',
        'backdrop-blur-2xl',
      )}
      style={{
        paddingLeft: isMac ? 76 : 12,
      }}
    >
      <div className="flex shrink-0 items-center gap-2">
        <img src={iconUrl} alt="" className="h-5 w-5 object-contain" />
        <span className="text-xs font-medium tracking-wide text-text-muted">MobaNexterm</span>
      </div>

      <button
        type="button"
        onClick={onOpenQuickConnect}
        className={cn(
          'titlebar-no-drag mx-auto flex h-6 w-72 max-w-md items-center gap-2 rounded-md',
          'border border-border bg-bg-elevated/60 px-2.5 text-xs text-text-muted',
          'transition hover:border-accent/40 hover:text-text',
        )}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{t('title.quickConnect')}</span>
        <kbd className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">⌘K</kbd>
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        className="titlebar-no-drag rounded-md p-1.5 text-text-muted transition hover:bg-bg-elevated hover:text-text"
        aria-label={t('common.settings')}
      >
        <Settings className="h-4 w-4" />
      </button>

      {!isMac ? (
        <div className="titlebar-no-drag -mr-3 ml-1 flex h-9 items-stretch">
          <WindowButton label={t('common.minimize')} onClick={() => void window.api.app.minimize()}>
            <Minus className="h-4 w-4" />
          </WindowButton>
          <WindowButton label={t('common.maximize')} onClick={() => void window.api.app.maximize()}>
            <Maximize2 className="h-3.5 w-3.5" />
          </WindowButton>
          <WindowButton label={t('common.close')} onClick={() => void window.api.app.close()} danger>
            <X className="h-4 w-4" />
          </WindowButton>
        </div>
      ) : null}
    </div>
  );
}

function WindowButton({
  label,
  children,
  onClick,
  danger = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex w-11 items-center justify-center text-text-muted transition hover:bg-bg-elevated hover:text-text',
        danger && 'hover:bg-danger hover:text-white',
      )}
    >
      {children}
    </button>
  );
}
