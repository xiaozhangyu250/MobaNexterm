import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { Monitor, RotateCcw, Settings, Terminal, X } from 'lucide-react';
import type { Language } from '@shared/types/ipc';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore, type ThemeMode } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';

type Category = 'appearance' | 'terminal' | 'ssh' | 'transfer';

const categories: { id: Category; labelKey: Parameters<ReturnType<typeof useI18n>>[0]; icon: React.ReactNode; disabled?: boolean }[] = [
  { id: 'appearance', labelKey: 'settings.appearance', icon: <Monitor className="h-4 w-4" /> },
  { id: 'terminal', labelKey: 'settings.terminal', icon: <Terminal className="h-4 w-4" /> },
  { id: 'ssh', labelKey: 'settings.ssh', icon: <Settings className="h-4 w-4" />, disabled: true },
  { id: 'transfer', labelKey: 'settings.transfer', icon: <Settings className="h-4 w-4" />, disabled: true },
];

export function SettingsDialog() {
  const t = useI18n();
  const [category, setCategory] = useState<Category>('appearance');
  const open = useUiStore((s) => s.settingsDialogOpen);
  const close = useUiStore((s) => s.closeSettingsDialog);
  const theme = useSettingsStore((s) => s.theme);
  const language = useSettingsStore((s) => s.language);
  const uiScale = useSettingsStore((s) => s.uiScale);
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const setUiScale = useSettingsStore((s) => s.setUiScale);
  const setTerminalFontSize = useSettingsStore((s) => s.setTerminalFontSize);
  const reset = useSettingsStore((s) => s.reset);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (!next ? close() : null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[520px] w-[720px] max-w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-border bg-bg text-text shadow-overlay outline-none">
          <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-bg-elevated/45">
            <div className="flex h-12 items-center gap-2 border-b border-border px-3">
              <Settings className="h-4 w-4 text-accent" />
              <Dialog.Title className="text-sm font-semibold">{t('common.settings')}</Dialog.Title>
            </div>
            <nav className="flex-1 p-2">
              {categories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={cn(
                    'mb-1 flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition',
                    item.disabled && category !== item.id
                      ? 'text-text-muted/55'
                      : item.id === category
                        ? 'bg-bg text-text'
                        : 'text-text-muted hover:bg-bg hover:text-text',
                  )}
                >
                  {item.icon}
                  <span>{t(item.labelKey)}</span>
                </button>
              ))}
            </nav>
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={reset}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-xs text-text-muted transition hover:bg-bg hover:text-text"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('common.reset')}
              </button>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="flex h-12 items-center justify-between border-b border-border px-4">
              <Dialog.Description className="text-xs text-text-muted">
                {t('settings.description')}
              </Dialog.Description>
              <Dialog.Close className="rounded p-1.5 text-text-muted transition hover:bg-bg-elevated hover:text-text">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="space-y-6 p-5">
              {category === 'appearance' ? (
                <section>
                  <h2 className="text-sm font-semibold">{t('settings.appearance')}</h2>
                  <div className="mt-3 space-y-4">
                    <SettingRow label={t('settings.theme')} value={theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}>
                      <SegmentedControl
                        value={theme}
                        options={[
                          { value: 'dark', label: t('settings.themeDark') },
                          { value: 'light', label: t('settings.themeLight') },
                        ]}
                        onChange={(value) => setTheme(value as ThemeMode)}
                      />
                    </SettingRow>
                    <SettingRow
                      label={t('settings.language')}
                      value={language === 'zh' ? t('settings.languageZh') : t('settings.languageEn')}
                    >
                      <SegmentedControl
                        value={language}
                        options={[
                          { value: 'en', label: t('settings.languageEn') },
                          { value: 'zh', label: t('settings.languageZh') },
                        ]}
                        onChange={(value) => setLanguage(value as Language)}
                      />
                    </SettingRow>
                    <SettingRow label={t('settings.uiScale')} value={`${uiScale}%`}>
                      <input
                        type="range"
                        min={80}
                        max={125}
                        step={5}
                        value={uiScale}
                        onChange={(e) => setUiScale(Number(e.target.value))}
                        className="w-52 accent-accent"
                      />
                    </SettingRow>
                  </div>
                </section>
              ) : null}

              {category === 'terminal' ? (
                <section>
                  <h2 className="text-sm font-semibold">{t('settings.terminal')}</h2>
                  <div className="mt-3 space-y-4">
                    <SettingRow label={t('settings.fontSize')} value={`${terminalFontSize}px`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={11}
                          max={20}
                          step={1}
                          value={terminalFontSize}
                          onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                          className="w-52 accent-accent"
                        />
                        <input
                          type="number"
                          min={11}
                          max={20}
                          value={terminalFontSize}
                          onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                          className="h-7 w-14 rounded border border-border bg-bg px-2 text-xs text-text outline-none focus:border-accent/70"
                        />
                      </div>
                    </SettingRow>
                  </div>
                </section>
              ) : null}

              {category === 'ssh' || category === 'transfer' ? (
                <section>
                  <h2 className="text-sm font-semibold">
                    {category === 'ssh' ? t('settings.ssh') : t('settings.transfer')}
                  </h2>
                  <div className="mt-3 rounded-md border border-dashed border-border bg-bg-elevated/35 p-4 text-xs text-text-muted">
                    {t('settings.reserved')}
                  </div>
                </section>
              ) : null}
            </div>
          </main>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SettingRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4">
      <div>
        <div className="text-xs font-medium text-text">{label}</div>
        <div className="mt-0.5 font-mono text-[10px] text-text-muted">{value}</div>
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-md border border-border bg-bg p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 rounded px-3 text-xs transition',
            value === option.value
              ? 'bg-accent text-white'
              : 'text-text-muted hover:bg-bg-elevated hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
