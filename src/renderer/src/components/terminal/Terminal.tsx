import * as ContextMenu from '@radix-ui/react-context-menu';
import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Clipboard, ClipboardPaste, Loader2 } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTerminalStore, type TabStatus } from '@/stores/terminalStore';

interface TerminalProps {
  tabId: string;
}

const xtermTheme = {
  background: '#0d0e10',
  foreground: '#e6e7e9',
  cursor: '#5b9dff',
  cursorAccent: '#0d0e10',
  selectionBackground: 'rgba(91, 157, 255, 0.25)',
  black: '#1a1c20',
  red: '#ff5a5a',
  green: '#3ecf8e',
  yellow: '#e5c07b',
  blue: '#5b9dff',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#e6e7e9',
  brightBlack: '#5c6370',
  brightRed: '#ff7a7a',
  brightGreen: '#67dfa0',
  brightYellow: '#ffd700',
  brightBlue: '#7eb6ff',
  brightMagenta: '#d68eea',
  brightCyan: '#7cc8d6',
  brightWhite: '#ffffff',
};

const xtermLightTheme = {
  background: '#f7f8fb',
  foreground: '#181b22',
  cursor: '#2563eb',
  cursorAccent: '#f7f8fb',
  selectionBackground: 'rgba(37, 99, 235, 0.18)',
  black: '#1f2937',
  red: '#dc2626',
  green: '#0f9f6e',
  yellow: '#a16207',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#f8fafc',
  brightBlack: '#64748b',
  brightRed: '#ef4444',
  brightGreen: '#10b981',
  brightYellow: '#ca8a04',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#ffffff',
};

export function Terminal({ tabId }: TerminalProps) {
  const t = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const tab = useTerminalStore((s) => s.tabs.find((item) => item.id === tabId));
  const reconnectTab = useTerminalStore((s) => s.reconnectTab);
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const theme = useSettingsStore((s) => s.theme);
  const initialFontSize = useRef(terminalFontSize);
  const initialTheme = useRef(theme);
  const statusRef = useRef<TabStatus>(tab?.status ?? 'connecting');
  const reconnectRef = useRef(reconnectTab);
  const [hasSelection, setHasSelection] = useState(false);

  statusRef.current = tab?.status ?? 'connecting';
  reconnectRef.current = reconnectTab;

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily:
        '"JetBrains Mono", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: initialFontSize.current,
      lineHeight: 1.2,
      theme: initialTheme.current === 'dark' ? xtermTheme : xtermLightTheme,
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    termRef.current = term;
    fitRef.current = fit;
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();

    async function copySelection() {
      const selection = term.getSelection();
      if (!selection) return;
      try {
        await navigator.clipboard.writeText(selection);
      } catch (e) {
        console.error('Failed to copy terminal selection', e);
      }
    }

    async function pasteClipboard() {
      if (statusRef.current !== 'connected') return;
      try {
        const text = await navigator.clipboard.readText();
        if (text) term.paste(text);
      } catch (e) {
        console.error('Failed to paste into terminal', e);
      }
    }

    term.attachCustomKeyEventHandler((event) => {
      const key = event.key.toLowerCase();
      if (event.ctrlKey && event.shiftKey && key === 'c') {
        if (event.type === 'keydown') void copySelection();
        return false;
      }
      if (event.ctrlKey && event.shiftKey && key === 'v') {
        if (event.type === 'keydown') void pasteClipboard();
        return false;
      }
      if (
        event.type === 'keydown' &&
        key === 'r' &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        (statusRef.current === 'closed' || statusRef.current === 'error')
      ) {
        void reconnectRef.current(tabId);
        return false;
      }
      return true;
    });

    // Pipe terminal input to backend
    const writeDisposable = term.onData((data) => {
      void window.api.ssh.write(tabId, data);
    });
    const selectionDisposable = term.onSelectionChange(() => {
      setHasSelection(term.hasSelection());
    });

    // Pipe backend output to terminal
    const offData = window.events.on('ssh:data', (payload) => {
      if (payload.tabId === tabId) term.write(payload.data);
    });

    // Resize handling
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        void window.api.ssh.resize(tabId, term.cols, term.rows);
      } catch {
        // ignore during teardown
      }
    });
    ro.observe(containerRef.current);

    // Focus on mount
    term.focus();

    return () => {
      writeDisposable.dispose();
      selectionDisposable.dispose();
      offData();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [tabId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = terminalFontSize;
    term.options.theme = theme === 'dark' ? xtermTheme : xtermLightTheme;
    try {
      fitRef.current?.fit();
      void window.api.ssh.resize(tabId, term.cols, term.rows);
    } catch {
      // ignore during setup and teardown
    }
  }, [tabId, terminalFontSize, theme]);

  useEffect(() => {
    termRef.current?.focus();
  }, [tab?.status]);

  async function copySelection() {
    const selection = termRef.current?.getSelection();
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection);
    } catch (e) {
      console.error('Failed to copy terminal selection', e);
    }
  }

  async function pasteClipboard() {
    if (tab?.status !== 'connected') return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) termRef.current?.paste(text);
    } catch (e) {
      console.error('Failed to paste into terminal', e);
    }
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="relative h-full w-full bg-bg">
          <div ref={containerRef} className="h-full w-full p-2" />
          <ConnectionState status={tab?.status ?? 'connecting'} message={tab?.errorMessage} />
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            termRef.current?.focus();
          }}
          className="z-50 min-w-[180px] rounded-md border border-border bg-bg-elevated p-1 text-xs text-text shadow-overlay"
        >
          <ContextMenu.Item
            disabled={!hasSelection}
            onSelect={() => void copySelection()}
            className={menuItemClass}
          >
            <Clipboard className="h-3.5 w-3.5" />
            <span className="flex-1">{t('common.copy')}</span>
            <span className="text-[10px] text-text-muted">Ctrl+Shift+C</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={tab?.status !== 'connected'}
            onSelect={() => void pasteClipboard()}
            className={menuItemClass}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            <span className="flex-1">{t('common.paste')}</span>
            <span className="text-[10px] text-text-muted">Ctrl+Shift+V</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

const menuItemClass = cn(
  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none',
  'data-[highlighted]:bg-bg data-[disabled]:cursor-default data-[disabled]:opacity-40',
);

function ConnectionState({ status, message }: { status: TabStatus; message?: string }) {
  const t = useI18n();
  if (status === 'connected') return null;

  if (status === 'connecting') {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/90">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <span>{t('terminal.connecting')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/90 px-8 text-center">
      <div className="max-w-lg font-mono text-xs">
        <div className={status === 'error' ? 'text-danger' : 'text-text'}>
          {status === 'error' ? t('terminal.connectionError') : t('terminal.connectionClosed')}
        </div>
        {message ? <div className="mt-1 break-words text-text-muted">{message}</div> : null}
        <div className="mt-3 text-text-muted">{t('terminal.pressRReconnect')}</div>
      </div>
    </div>
  );
}
