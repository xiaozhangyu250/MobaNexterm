import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState } from 'react';
import { X, FileJson } from 'lucide-react';
import type { Shortcut } from '@shared/types/shortcut';
import type { PortableShortcut, ShortcutImportPreview } from '@shared/shortcutTransfer';
import { SHORTCUT_ENTRY_LIMIT } from '@shared/shortcutTransfer';
import { useSessionStore } from '@/stores/sessionStore';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errorMessage';

export type ShortcutTransfer =
  | { mode: 'export'; items: Shortcut[] }
  | { mode: 'import'; preview: ShortcutImportPreview };
export function ShortcutTransferDialog({
  transfer,
  onClose,
  onComplete,
}: {
  transfer: ShortcutTransfer;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const t = useI18n();
  const sessions = useSessionStore((s) => s.sessions);
  const importing = transfer.mode === 'import';
  const [entries] = useState<PortableShortcut[]>(() =>
    transfer.mode === 'import'
      ? transfer.preview.shortcuts
      : transfer.items.map((s) => ({
          name: s.name,
          directory: s.directory,
          command: s.command,
          scope:
            s.sessionId === null
              ? { kind: 'global' }
              : {
                  kind: 'host',
                  label:
                    sessions.find((host) => host.id === s.sessionId)?.name ??
                    t('shortcuts.deletedHost'),
                },
        })),
  );
  const [selected, setSelected] = useState(() => new Set(entries.map((_, i) => i)));
  const [targets, setTargets] = useState<string[]>(() =>
    entries.map((s) => (s.scope.kind === 'global' ? '@global' : '')),
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const missingTarget =
    importing &&
    [...selected].some(
      (index) =>
        !targets[index] ||
        (targets[index] !== '@global' && !sessions.some((s) => s.id === targets[index])),
    );
  const close = () => {
    if (!busyRef.current) onClose();
  };
  const submit = async () => {
    if (busyRef.current || !selected.size || missingTarget || selected.size > SHORTCUT_ENTRY_LIMIT)
      return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const indices = [...selected].sort((a, b) => a - b);
      if (transfer.mode === 'export') {
        const result = await window.api.shortcuts.exportFile(
          indices.map((i) => transfer.items[i].id),
        );
        if (result)
          onComplete(t('transfer.exported', { count: result.count, filename: result.filename }));
      } else {
        const result = await window.api.shortcuts.importCopies(
          indices.map((i) => ({
            name: entries[i].name,
            directory: entries[i].directory,
            command: entries[i].command,
            sessionId: targets[i] === '@global' ? null : targets[i],
          })),
        );
        onComplete(t('transfer.imported', { count: result.length }));
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const options = (
    <>
      <option value="">{t('transfer.chooseScope')}</option>
      <option value="@global">{t('shortcuts.global')}</option>
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} · {s.username}@{s.host}
        </option>
      ))}
    </>
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[740px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-bg text-text shadow-overlay outline-none"
          onEscapeKeyDown={(event) => {
            if (busyRef.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busyRef.current) event.preventDefault();
          }}
        >
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <FileJson size={20} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold">
                {t(importing ? 'transfer.importTitle' : 'transfer.exportTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-text-muted">
                {t(importing ? 'transfer.importHint' : 'transfer.exportHint')}
              </Dialog.Description>
              {transfer.mode === 'import' && (
                <p
                  className="mt-1 truncate font-mono text-xs text-text-muted"
                  title={transfer.preview.filename}
                >
                  {transfer.preview.filename}
                </p>
              )}
            </div>
            <button
              disabled={busy}
              onClick={close}
              aria-label={t('common.cancel')}
              className="rounded p-1 text-text-muted hover:bg-bg-elevated disabled:opacity-40"
            >
              <X size={16} />
            </button>
          </header>
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-xs">
            <button
              disabled={busy}
              className="text-accent"
              onClick={() => setSelected(new Set(entries.map((_, i) => i)))}
            >
              {t('transfer.selectAll')}
            </button>
            <button
              disabled={busy}
              className="text-text-muted"
              onClick={() => setSelected(new Set())}
            >
              {t('transfer.selectNone')}
            </button>
            <span className="text-text-muted">
              {t('transfer.selected', { count: selected.size, total: entries.length })}
            </span>
            {importing && (
              <select
                value=""
                disabled={busy || !selected.size}
                aria-label={t('transfer.bulkScope')}
                className="ml-auto max-w-full rounded border border-border bg-bg px-2 py-1 text-xs"
                onChange={(event) => {
                  const value = event.target.value;
                  if (value)
                    setTargets((previous) =>
                      previous.map((target, index) => (selected.has(index) ? value : target)),
                    );
                }}
              >
                <option value="">{t('transfer.bulkScope')}</option>
                <option value="@global">{t('shortcuts.global')}</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.username}@{s.host}
                  </option>
                ))}
              </select>
            )}
          </div>
          <fieldset disabled={busy} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
            {entries.map((entry, index) => (
              <div
                key={index}
                className={`rounded-lg border p-3 ${selected.has(index) ? 'border-accent bg-bg-elevated' : 'border-border'}`}
              >
                <div className="flex items-center gap-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="shrink-0 accent-accent"
                      aria-label={t('transfer.selectCommand', { name: entry.name })}
                      checked={selected.has(index)}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(index);
                        else next.delete(index);
                        setSelected(next);
                      }}
                    />
                    <span className="truncate" title={entry.name}>
                      {entry.name}
                    </span>
                  </label>
                  <span
                    className="max-w-[45%] truncate text-[11px] text-text-muted"
                    title={entry.scope.kind === 'host' ? entry.scope.label : undefined}
                  >
                    {entry.scope.kind === 'global'
                      ? t('shortcuts.global')
                      : t('transfer.sourceHost', { name: entry.scope.label })}
                  </span>
                </div>
                {importing && (
                  <select
                    disabled={!selected.has(index)}
                    aria-label={t('transfer.targetScope', { name: entry.name })}
                    value={targets[index]}
                    className="mt-2 w-full rounded border border-border bg-bg px-2 py-1.5 text-xs disabled:opacity-40"
                    onChange={(event) =>
                      setTargets((previous) =>
                        previous.map((target, i) => (i === index ? event.target.value : target)),
                      )
                    }
                  >
                    {options}
                  </select>
                )}
                <details className="mt-2 text-xs text-text-muted">
                  <summary className="cursor-pointer">{t('transfer.preview')}</summary>
                  <p className="mt-2 break-all font-mono">
                    {entry.directory || t('shortcuts.currentDirectory')}
                  </p>
                  <pre className="mt-2 max-h-48 select-text overflow-auto whitespace-pre-wrap break-words rounded bg-bg p-2 font-mono text-text">
                    {entry.command}
                  </pre>
                </details>
              </div>
            ))}
          </fieldset>
          <footer className="border-t border-border px-5 py-3">
            {missingTarget && (
              <p className="mb-2 text-xs text-text-muted">{t('transfer.mappingRequired')}</p>
            )}
            {selected.size > SHORTCUT_ENTRY_LIMIT && (
              <p className="mb-2 text-xs text-danger">{t('transfer.limit')}</p>
            )}
            {error && (
              <p role="alert" className="mb-2 text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                disabled={busy}
                className="rounded border border-border px-3 py-2 text-xs disabled:opacity-40"
                onClick={close}
              >
                {t('common.cancel')}
              </button>
              <button
                disabled={
                  busy || !selected.size || missingTarget || selected.size > SHORTCUT_ENTRY_LIMIT
                }
                onClick={() => void submit()}
                className="rounded bg-accent px-4 py-2 text-xs text-white disabled:opacity-40"
              >
                {busy
                  ? t('transfer.working')
                  : t(importing ? 'transfer.importSelected' : 'transfer.exportSelected', {
                      count: selected.size,
                    })}
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
