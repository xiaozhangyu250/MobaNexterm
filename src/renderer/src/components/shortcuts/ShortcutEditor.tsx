import { useEffect, useMemo, useRef, useState } from 'react';
import { Save, CheckCheck } from 'lucide-react';
import type { Session } from '@shared/types/session';
import { validateShortcut, type ShortcutInput, type SyntaxCheck } from '@shared/types/shortcut';
import { useSettingsStore } from '@/stores/settingsStore';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errorMessage';
import { highlightShell } from '@/lib/shellHighlight';

export function ShortcutEditor() {
  const t = useI18n();
  const [params] = useState(() => new URLSearchParams(location.hash.split('?')[1]));
  const [id, setId] = useState(params.get('id') ?? undefined);
  const [revision, setRevision] = useState<number>();
  const [input, setInput] = useState<ShortcutInput>({
    name: '',
    directory: '',
    command: '',
    sessionId: params.get('sessionId'),
  });
  const [saved, setSaved] = useState(JSON.stringify(input));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<(SyntaxCheck & { source: string }) | null>(null);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const busy = useRef(false);
  const checkBusy = useRef(false);
  const highlight = useRef<HTMLPreElement>(null);
  const theme = useSettingsStore((s) => s.theme);
  const dirty = JSON.stringify(input) !== saved;
  const tokens = useMemo(() => highlightShell(input.command), [input.command]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    let disposed = false;
    Promise.all([window.api.shortcuts.list(), window.api.session.list()])
      .then(([items, hosts]) => {
        if (disposed) return;
        setSessions(hosts);
        const existingId = params.get('id');
        if (existingId) {
          const item = items.find((s) => s.id === existingId);
          if (!item) throw new Error('Shortcut not found / 指令已删除');
          const data = {
            name: item.name,
            directory: item.directory,
            command: item.command,
            sessionId: item.sessionId,
          };
          setInput(data);
          setSaved(JSON.stringify(data));
          setRevision(item.updatedAt);
        }
      })
      .catch((e) => {
        if (!disposed) {
          setError(errorMessage(e));
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [params]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty || saving) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', prevent);
    document.title = `${dirty ? '● ' : ''}${input.name || t('shortcuts.add')} — MobaNexterm`;
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, saving, input.name, t]);
  const save = async () => {
    if (busy.current || loading || loadFailed) return;
    busy.current = true;
    setSaving(true);
    setError('');
    const snapshot = { ...input, command: input.command.replaceAll('\r\n', '\n') };
    try {
      validateShortcut(snapshot);
      const item = await window.api.shortcuts.save(snapshot, id, revision);
      history.replaceState(null, '', `#shortcut?${new URLSearchParams({ id: item.id })}`);
      setId(item.id);
      setRevision(item.updatedAt);
      setSaved(JSON.stringify(snapshot));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const syntax = async () => {
    if (checkBusy.current) return;
    checkBusy.current = true;
    setChecking(true);
    setError('');
    const source = input.command;
    try {
      setCheck({ ...(await window.api.shortcuts.check(source)), source });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      checkBusy.current = false;
      setChecking(false);
    }
  };
  const field =
    'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent';
  return (
    <main
      className="flex h-screen flex-col bg-bg text-text"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          void save();
        }
      }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bg-elevated/40 px-5 py-3">
        <div className="flex-1">
          <h1 className="text-sm font-semibold">{t('shortcuts.editor')}</h1>
          <p className="mt-1 text-xs text-text-muted">{t('shortcuts.editorHint')}</p>
        </div>
        <button
          className="flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-xs text-white disabled:opacity-40"
          disabled={loading || loadFailed || saving || !dirty}
          onClick={() => void save()}
        >
          <Save size={14} />
          {saving ? t('editor.saving') : t('editor.save')}
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1.5 text-xs">
            {t('shortcuts.name')}
            <input
              className={field}
              aria-label={t('shortcuts.name')}
              maxLength={100}
              value={input.name}
              disabled={loading}
              onChange={(e) => setInput({ ...input, name: e.target.value })}
            />
          </label>
          <label className="space-y-1.5 text-xs">
            {t('shortcuts.scope')}
            <select
              className={field}
              aria-label={t('shortcuts.scope')}
              value={input.sessionId ?? ''}
              disabled={loading}
              onChange={(e) => setInput({ ...input, sessionId: e.target.value || null })}
            >
              <option value="">{t('shortcuts.global')}</option>
              {input.sessionId && !sessions.some((s) => s.id === input.sessionId) && (
                <option value={input.sessionId}>{t('shortcuts.deletedHost')}</option>
              )}
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.username}@{s.host}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="space-y-1.5 text-xs">
          {t('shortcuts.directory')}
          <input
            className={`${field} font-mono`}
            aria-label={t('shortcuts.directory')}
            placeholder={t('shortcuts.directoryHint')}
            value={input.directory}
            disabled={loading}
            onChange={(e) => setInput({ ...input, directory: e.target.value })}
          />
        </label>
        <div className="flex items-center justify-between">
          <label htmlFor="shortcut-script" className="text-xs">
            {t('shortcuts.command')}
          </label>
          <button
            disabled={loading || checking || !input.command.trim()}
            className="flex items-center gap-1.5 text-xs text-accent disabled:opacity-40"
            onClick={() => void syntax()}
          >
            <CheckCheck size={14} />
            {checking ? t('shortcuts.checking') : t('shortcuts.check')}
          </button>
        </div>
        <div className="shell-editor relative min-h-[180px] flex-1 overflow-hidden rounded-lg border border-border bg-bg-elevated/30 focus-within:border-accent">
          <pre
            ref={highlight}
            aria-hidden="true"
            className="shell-layer pointer-events-none absolute inset-0 overflow-hidden"
          >
            {tokens.map((token, index) => (
              <span key={index} className={`shell-${token.kind}`}>
                {token.text}
              </span>
            ))}
            {'\n'}
          </pre>
          <textarea
            id="shortcut-script"
            className="shell-layer absolute inset-0 h-full w-full resize-none bg-transparent text-transparent caret-accent outline-none"
            aria-label={t('shortcuts.command')}
            wrap="off"
            spellCheck={false}
            value={input.command}
            maxLength={16384}
            disabled={loading}
            onChange={(e) =>
              setInput({ ...input, command: e.target.value.replaceAll('\r\n', '\n') })
            }
            onScroll={(e) => {
              if (highlight.current) {
                highlight.current.scrollTop = e.currentTarget.scrollTop;
                highlight.current.scrollLeft = e.currentTarget.scrollLeft;
              }
            }}
          />
        </div>
        {check && check.source === input.command && (
          <pre
            role="status"
            className={`max-h-24 shrink-0 overflow-auto whitespace-pre-wrap text-xs ${check.valid ? 'text-success' : 'text-danger'}`}
          >
            {check.message}
          </pre>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        <p className="text-[11px] leading-5 text-text-muted">{t('shortcuts.syntaxHint')}</p>
      </div>
      <footer className="flex shrink-0 justify-between border-t border-border px-5 py-2 text-[11px] text-text-muted">
        <span>{dirty ? t('shortcuts.unsaved') : t('shortcuts.saved')}</span>
        <span>
          Ctrl+S · {input.command.split('\n').length} {t('shortcuts.lines')}
        </span>
      </footer>
    </main>
  );
}
