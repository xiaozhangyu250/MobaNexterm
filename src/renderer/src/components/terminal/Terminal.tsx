import { registerTerminalAction } from '@/lib/terminalActions';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Clipboard, ClipboardPaste, Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { appendTerminalNotice } from '@/lib/terminalNotice';
import { errorMessage } from '@/lib/errorMessage';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTerminalStore, type TabStatus } from '@/stores/terminalStore';

interface TerminalProps {
  tabId: string;
}

const xtermTheme = {
  background: '#10151e',
  foreground: '#e6e7e9',
  cursor: '#5b9dff',
  cursorAccent: '#10151e',
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
  white: '#475569',
  brightBlack: '#64748b',
  brightRed: '#ef4444',
  brightGreen: '#10b981',
  brightYellow: '#ca8a04',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#06b6d4',
  brightWhite: '#0f172a',
};

export function Terminal({ tabId }: TerminalProps) {
  const t = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState('');
  const fitRef = useRef<FitAddon | null>(null);
  const tab = useTerminalStore((s) => s.tabs.find((item) => item.id === tabId));
  const active = useTerminalStore((s) => s.activeId === tabId);
  const attempt = tab?.connectionAttempt ?? 1;
  const reconnectTab = useTerminalStore((s) => s.reconnectTab);
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const theme = useSettingsStore((s) => s.theme);
  const uiScale = useSettingsStore((s) => s.uiScale);
  const initialFontSize = useRef(terminalFontSize);
  const initialTheme = useRef(theme);
  const statusRef = useRef<TabStatus>(tab?.status ?? 'connecting');
  const reconnectRef = useRef(reconnectTab);
  const [hasSelection, setHasSelection] = useState(false);
  const noticeRef = useRef<{ term: XTerm; attempt: number } | null>(null);
  const translateRef = useRef(t);
  translateRef.current = t;

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
      windowsMode: false,
    });
    let disposed = false;
    let frame = 0;
    const search = new SearchAddon();
    searchRef.current = search;
    const fit = new FitAddon();
    const unregisterAction = registerTerminalAction(tabId, async (shortcutId) => {
      if (statusRef.current !== 'connected' || useTerminalStore.getState().activeId !== tabId)
        throw new Error('Active terminal is disconnected / 当前终端未连接');
      if (term.buffer.active.type === 'alternate')
        throw new Error(
          'Exit the full-screen program before running a shortcut / 请先退出全屏程序再执行快捷指令',
        );
      await window.api.shortcuts.execute(shortcutId, tabId);
      term.focus();
    });
    termRef.current = term;
    fitRef.current = fit;
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    const searchResult = search.onDidChangeResults((result) =>
      setMatches(`${result.resultIndex + 1} / ${result.resultCount}`),
    );
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);

    const fitTerminal = () => {
      if (
        disposed ||
        !containerRef.current ||
        containerRef.current.clientWidth === 0 ||
        containerRef.current.clientHeight === 0
      ) {
        return;
      }
      try {
        fit.fit();
        void window.api.ssh.resize(tabId, term.cols, term.rows).catch(console.error);
      } catch {
        // ignore during setup and teardown
      }
    };

    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitTerminal);
    };

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
      if (event.ctrlKey && event.shiftKey && key === 'f') {
        if (event.type === 'keydown') setSearchOpen(true);
        return false;
      }
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
      if (statusRef.current === 'connected')
        void window.api.ssh.write(tabId, data).catch(console.error);
    });
    const selectionDisposable = term.onSelectionChange(() => {
      setHasSelection(term.hasSelection());
    });

    // Pipe backend output to terminal
    const offData = window.events.on('ssh:data', (payload) => {
      if (payload.tabId === tabId)
        term.write(payload.data, () => {
          if (!disposed)
            window.api.ssh.acknowledge(tabId, payload.connectionId, payload.data.length);
        });
    });

    // Resize handling
    const ro = new ResizeObserver(scheduleFit);
    ro.observe(containerRef.current);
    window.addEventListener('resize', scheduleFit);
    window.addEventListener('focus', scheduleFit);
    document.addEventListener('visibilitychange', scheduleFit);

    // Focus on mount
    if (useTerminalStore.getState().activeId === tabId) term.focus();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      unregisterAction();
      searchResult.dispose();
      writeDisposable.dispose();
      selectionDisposable.dispose();
      offData();
      ro.disconnect();
      window.removeEventListener('resize', scheduleFit);
      window.removeEventListener('focus', scheduleFit);
      document.removeEventListener('visibilitychange', scheduleFit);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [tabId]);

  // The terminal survives reconnects so previous sessions stay in scrollback.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    let cancelled = false;
    let frame = 0;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        fitRef.current?.fit();
        void appendTerminalNotice(
          term,
          [translateRef.current('terminal.connecting')],
          'cyan',
          () => termRef.current === term,
        ).then(() => {
          if (!cancelled) void useTerminalStore.getState().connectTab(tabId, term.cols, term.rows);
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [tabId, attempt]);

  useEffect(() => {
    const term = termRef.current;
    if (!term || (tab?.status !== 'closed' && tab?.status !== 'error')) return;
    if (noticeRef.current?.term === term && noticeRef.current.attempt === attempt) return;
    noticeRef.current = { term, attempt };
    void appendTerminalNotice(
      term,
      [
        t(tab.status === 'error' ? 'terminal.connectionError' : 'terminal.connectionClosed'),
        ...(tab.errorMessage ? [errorMessage(tab.errorMessage)] : []),
        t('terminal.pressRReconnect'),
      ],
      'red',
      () => termRef.current === term,
    );
  }, [attempt, tab?.status, tab?.errorMessage, t]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = terminalFontSize;
    term.options.theme = theme === 'dark' ? xtermTheme : xtermLightTheme;
    const frame = window.requestAnimationFrame(() => {
      if (
        !containerRef.current ||
        containerRef.current.clientWidth === 0 ||
        containerRef.current.clientHeight === 0
      ) {
        return;
      }
      try {
        fitRef.current?.fit();
        void window.api.ssh.resize(tabId, term.cols, term.rows);
      } catch {
        // ignore during setup and teardown
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tabId, terminalFontSize, theme, uiScale]);

  useEffect(() => {
    if (active) termRef.current?.focus();
  }, [active, tab?.status]);

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

  const searchFor = (text: string, backwards = false) => {
    const options = {
      decorations: {
        matchBackground: '#735c14',
        activeMatchBackground: '#2563eb',
        matchOverviewRuler: '#735c14',
        activeMatchColorOverviewRuler: '#2563eb',
      },
    };
    if (!text) {
      searchRef.current?.clearDecorations();
      setMatches('');
      return;
    }
    if (backwards) searchRef.current?.findPrevious(text, options);
    else searchRef.current?.findNext(text, options);
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-bg p-2">
          <div ref={containerRef} className="h-full min-h-0 w-full min-w-0 overflow-hidden" />
          {searchOpen && active ? (
            <div className="absolute right-4 top-3 z-20 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated p-2 text-xs shadow-overlay">
              <Search className="h-3.5 w-3.5 text-text-muted" />
              <input
                autoFocus
                aria-label={t('terminal.search')}
                placeholder={t('terminal.search')}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  searchFor(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') searchFor(query, e.shiftKey);
                  if (e.key === 'Escape') {
                    searchRef.current?.clearDecorations();
                    setSearchOpen(false);
                    termRef.current?.focus();
                  }
                }}
                className="w-44 bg-transparent outline-none"
              />
              <span className="text-text-muted">{matches}</span>
              <button aria-label={t('search.previous')} onClick={() => searchFor(query, true)}>
                <ChevronUp className="h-4 w-4" />
              </button>
              <button aria-label={t('search.next')} onClick={() => searchFor(query)}>
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                aria-label={t('common.close')}
                onClick={() => {
                  setSearchOpen(false);
                  searchRef.current?.clearDecorations();
                  termRef.current?.focus();
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
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
          <ContextMenu.Item onSelect={() => setSearchOpen(true)} className={menuItemClass}>
            <Search className="h-3.5 w-3.5" />
            {t('terminal.search')}
            <span className="ml-auto text-[10px] text-text-muted">Ctrl+Shift+F</span>
          </ContextMenu.Item>
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
