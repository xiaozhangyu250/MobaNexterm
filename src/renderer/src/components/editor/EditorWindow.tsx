import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/errorMessage';
import { TextEditorDialog } from '../sftp/TextEditorDialog';
import { useSettingsStore } from '@/stores/settingsStore';

export function EditorWindow() {
  const [target] = useState(() => new URLSearchParams(location.hash.split('?')[1]));
  const tabId = target.get('tabId') ?? '';
  const path = target.get('path') ?? '';
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useSettingsStore((s) => s.theme);
  const dirty = content !== original.replaceAll('\r\n', '\n');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    let disposed = false;
    window.api.sftp.readFile(tabId, path).then(
      (text) => {
        if (!disposed) {
          setContent(text.replaceAll('\r\n', '\n'));
          setOriginal(text);
          setLoading(false);
        }
      },
      (e: unknown) => {
        if (!disposed) {
          setLoading(false);
          setError(errorMessage(e));
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [tabId, path]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (!dirty && !saving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    document.title = `${dirty ? '● ' : ''}${path} — MobaNexterm`;
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, saving, path]);

  const save = async () => {
    if (savingRef.current || loading || !dirty) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const snapshot =
      original.includes('\r\n') && !/(?<!\r)\n/.test(original)
        ? content.replaceAll('\n', '\r\n')
        : content;
    try {
      await window.api.sftp.writeFile(tabId, path, snapshot, original);
      // Edits made while the request was in flight remain dirty.
      setOriginal(snapshot);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <TextEditorDialog
      open
      path={path}
      content={content}
      dirty={dirty}
      loading={loading}
      saving={saving}
      error={error}
      onChange={setContent}
      onSave={() => void save()}
      onClose={() => void window.api.app.close()}
    />
  );
}
