import { ShortcutTransferDialog, type ShortcutTransfer } from './ShortcutTransferDialog';
import { useEffect, useRef, useState } from 'react';
import { Plus, Play, Pencil, Trash2, Globe, Server, Upload, Download } from 'lucide-react';
import { availableShortcuts, type Shortcut } from '@shared/types/shortcut';
import { useTerminalStore } from '@/stores/terminalStore';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errorMessage';
import { runTerminalShortcut } from '@/lib/terminalActions';

export function ShortcutsPanel() {
  const t = useI18n();
  const tab = useTerminalStore((s) => s.tabs.find((tab) => tab.id === s.activeId));
  const [items, setItems] = useState<Shortcut[]>([]);
  const [error, setError] = useState('');
  const [transfer, setTransfer] = useState<ShortcutTransfer | null>(null);
  const [choosing, setChoosing] = useState(false);
  const choosingRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let disposed = false;
    let request = 0;
    const load = async () => {
      const current = ++request;
      try {
        const data = await window.api.shortcuts.list();
        if (!disposed && current === request) setItems(data);
      } catch (e) {
        if (!disposed) setError(errorMessage(e));
      }
    };
    const off = window.events.on('shortcuts:changed', () => void load());
    void load();
    return () => {
      disposed = true;
      off();
    };
  }, []);
  useEffect(() => {
    setError('');
    setPendingDelete(null);
  }, [tab?.id]);
  const action = async (fn: () => Promise<unknown>) => {
    try {
      setError('');
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const run = async (item: Shortcut) => {
    if (!tab || busy.current) return;
    busy.current = true;
    setRunning(true);
    await action(() => runTerminalShortcut(tab.id, item.id));
    busy.current = false;
    setRunning(false);
  };
  const chooseImport = async () => {
    if (choosingRef.current) return;
    choosingRef.current = true;
    setChoosing(true);
    setNotice('');
    await action(async () => {
      const preview = await window.api.shortcuts.chooseImport();
      if (preview) setTransfer({ mode: 'import', preview });
    });
    choosingRef.current = false;
    setChoosing(false);
  };
  const visible = availableShortcuts(items, tab?.sessionId);
  return (
    <section className="flex h-full flex-col" aria-label={t('shortcuts.title')}>
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold">{t('shortcuts.title')}</h2>
          <p className="truncate text-[11px] text-text-muted">
            {tab?.title ?? t('shortcuts.noTerminal')}
          </p>
        </div>
        <button
          className="rounded p-1.5 text-accent hover:bg-bg"
          aria-label={t('shortcuts.add')}
          title={t('shortcuts.add')}
          onClick={() =>
            void action(() => window.api.shortcuts.openEditor(undefined, tab?.sessionId))
          }
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="flex gap-2 border-b border-border px-3 py-2">
        <button
          disabled={choosing}
          onClick={() => void chooseImport()}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg hover:text-text disabled:opacity-40"
        >
          <Upload size={13} />
          {t('transfer.importTitle')}
        </button>
        <button
          disabled={!items.length || choosing}
          onClick={() => {
            setError('');
            setNotice('');
            setTransfer({ mode: 'export', items });
          }}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg hover:text-text disabled:opacity-40"
        >
          <Download size={13} />
          {t('transfer.exportTitle')}
        </button>
      </div>
      {notice && (
        <p role="status" className="px-3 py-2 text-xs text-success">
          {notice}
        </p>
      )}
      {transfer && (
        <ShortcutTransferDialog
          transfer={transfer}
          onClose={() => setTransfer(null)}
          onComplete={(message) => {
            setNotice(message);
            setTransfer(null);
          }}
        />
      )}
      <p className="px-3 py-2 text-[11px] leading-5 text-text-muted">{t('shortcuts.runHint')}</p>
      {error && (
        <p role="alert" className="px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex-1 space-y-2 overflow-auto px-2 pb-2">
        {visible.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-muted">{t('shortcuts.empty')}</p>
        )}
        {visible.map((item) => (
          <div key={item.id} className="rounded-lg border border-border bg-bg-elevated/40 p-2">
            <button
              className="flex w-full items-center gap-2 rounded px-1 py-2 text-left hover:bg-accent/10 disabled:opacity-40"
              disabled={tab?.status !== 'connected' || running}
              onClick={() => void run(item)}
              title={`${item.directory || t('shortcuts.currentDirectory')}\n${item.command}`}
              aria-label={`${t('shortcuts.run')} ${item.name}`}
            >
              <Play size={14} className="shrink-0 text-accent" />
              <span className="truncate text-xs font-medium">{item.name}</span>
            </button>
            <div className="flex items-center gap-1 px-1 text-[10px] text-text-muted">
              {item.sessionId ? <Server size={11} /> : <Globe size={11} />}
              <span>{item.sessionId ? t('shortcuts.hostOnly') : t('shortcuts.global')}</span>
              <span className="ml-auto" />
              <button
                className="rounded p-1 hover:text-text"
                aria-label={`${t('shortcuts.edit')} ${item.name}`}
                onClick={() => void action(() => window.api.shortcuts.openEditor(item.id))}
              >
                <Pencil size={12} />
              </button>
              <button
                className="rounded p-1 hover:text-danger"
                aria-label={`${t('common.delete')} ${item.name}`}
                onClick={() => setPendingDelete(item.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <p className="truncate px-1 font-mono text-[10px] text-text-muted">
              {item.directory || t('shortcuts.currentDirectory')}
            </p>
            {pendingDelete === item.id && (
              <div className="mt-2 flex items-center justify-end gap-3 border-t border-border pt-2 text-xs">
                <button onClick={() => setPendingDelete(null)}>{t('common.cancel')}</button>
                <button
                  className="text-danger"
                  onClick={() =>
                    void action(async () => {
                      await window.api.shortcuts.remove(item.id);
                      setPendingDelete(null);
                    })
                  }
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
