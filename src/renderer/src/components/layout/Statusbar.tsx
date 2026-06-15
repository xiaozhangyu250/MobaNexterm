import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

export function Statusbar() {
  const t = useI18n();
  const [version, setVersion] = useState<string>('');
  const [pong, setPong] = useState<string>('');

  useEffect(() => {
    window.api.app.getVersion().then(setVersion);
    window.api.app.ping().then(setPong);
  }, []);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-bg-elevated/40 px-3 text-[10px] text-text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        {t('status.ready')}
      </span>
      <span>•</span>
      <span>v{version || '0.0.0'}</span>
      <span>•</span>
      <span>UTF-8</span>
      <span className="ml-auto">IPC {pong || '...'}</span>
    </footer>
  );
}
