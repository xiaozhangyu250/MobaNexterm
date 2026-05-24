import { useEffect, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useUiStore } from '@/stores/uiStore';
import { useSessionStore } from '@/stores/sessionStore';
import { cn } from '@/lib/utils';

interface FormState {
  name: string;
  host: string;
  port: string;
  username: string;
  authKind: 'password' | 'key';
  password: string;
  privateKeyPath: string;
  passphrase: string;
}

const empty: FormState = {
  name: '',
  host: '',
  port: '22',
  username: '',
  authKind: 'password',
  password: '',
  privateKeyPath: '',
  passphrase: '',
};

export function SessionDialog() {
  const t = useI18n();
  const open = useUiStore((s) => s.sessionDialogOpen);
  const close = useUiStore((s) => s.closeSessionDialog);
  const editing = useUiStore((s) => s.sessionDialogEditing);
  const create = useSessionStore((s) => s.create);
  const update = useSessionStore((s) => s.update);

  const [form, setForm] = useState<FormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name,
          host: editing.host,
          port: String(editing.port),
          username: editing.username,
          authKind: editing.auth.kind === 'key' ? 'key' : 'password',
          password: '',
          privateKeyPath: editing.auth.kind === 'key' ? editing.auth.privateKeyPath : '',
          passphrase: '',
        });
      } else {
        setForm(empty);
      }
      setError(null);
    }
  }, [open, editing]);

  function update_<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      setError(t('session.required'));
      return;
    }
    const port = parseInt(form.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      setError(t('session.portInvalid'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        host: form.host.trim(),
        port,
        username: form.username.trim(),
        authKind: form.authKind,
        password: form.authKind === 'password' ? form.password : undefined,
        privateKeyPath: form.authKind === 'key' ? form.privateKeyPath : undefined,
        passphrase: form.authKind === 'key' ? form.passphrase : undefined,
      };
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload);
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-bg-elevated p-5 text-text shadow-overlay',
            'focus:outline-none',
          )}
        >
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold">
              {editing ? t('session.editTitle') : t('session.newTitle')}
            </Dialog.Title>
            <Dialog.Close
              className="rounded p-1 text-text-muted transition hover:bg-bg hover:text-text"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <Field label={t('session.name')}>
              <Input
                value={form.name}
                onChange={(v) => update_('name', v)}
                placeholder="prod-web-01"
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field label={t('session.host')}>
                <Input
                  value={form.host}
                  onChange={(v) => update_('host', v)}
                  placeholder="127.0.0.1"
                />
              </Field>
              <Field label={t('session.port')}>
                <Input value={form.port} onChange={(v) => update_('port', v)} className="w-20" />
              </Field>
            </div>

            <Field label={t('session.username')}>
              <Input
                value={form.username}
                onChange={(v) => update_('username', v)}
                placeholder="root"
              />
            </Field>

            <Field label={t('session.auth')}>
              <div className="flex gap-2">
                <RadioOption
                  checked={form.authKind === 'password'}
                  onClick={() => update_('authKind', 'password')}
                  label={t('session.password')}
                />
                <RadioOption
                  checked={form.authKind === 'key'}
                  onClick={() => update_('authKind', 'key')}
                  label={t('session.privateKey')}
                />
              </div>
            </Field>

            {form.authKind === 'password' ? (
              <Field label={editing ? t('session.passwordKeep') : t('session.password')}>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(v) => update_('password', v)}
                />
              </Field>
            ) : (
              <>
                <Field label={t('session.privateKeyPath')}>
                  <Input
                    value={form.privateKeyPath}
                    onChange={(v) => update_('privateKeyPath', v)}
                    placeholder="/home/you/.ssh/id_ed25519"
                  />
                </Field>
                <Field label={t('session.passphrase')}>
                  <Input
                    type="password"
                    value={form.passphrase}
                    onChange={(v) => update_('passphrase', v)}
                  />
                </Field>
              </>
            )}

            {error && (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-xs text-danger">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted transition hover:bg-bg hover:text-text"
              >
                {t('session.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-50"
              >
                {submitting ? t('session.saving') : editing ? t('session.save') : t('session.create')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs text-text',
        'placeholder:text-text-muted focus:border-accent focus:outline-none',
        className,
      )}
    />
  );
}

function RadioOption({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border px-2 py-1.5 text-xs transition',
        checked
          ? 'border-accent bg-accent/10 text-text'
          : 'border-border bg-bg text-text-muted hover:text-text',
      )}
    >
      {label}
    </button>
  );
}
