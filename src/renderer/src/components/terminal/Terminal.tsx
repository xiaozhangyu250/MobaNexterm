import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTerminalStore } from '@/stores/terminalStore';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const setStatus = useTerminalStore((s) => s.setStatus);
  const terminalFontSize = useSettingsStore((s) => s.terminalFontSize);
  const theme = useSettingsStore((s) => s.theme);
  const initialFontSize = useRef(terminalFontSize);
  const initialTheme = useRef(theme);

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

    // Pipe terminal input to backend
    const writeDisposable = term.onData((data) => {
      void window.api.ssh.write(tabId, data);
    });

    // Pipe backend output to terminal
    const offData = window.events.on('ssh:data', (payload) => {
      if (payload.tabId === tabId) term.write(payload.data);
    });
    const offStatus = window.events.on('ssh:status', (payload) => {
      if (payload.tabId === tabId) {
        setStatus(tabId, payload.status, payload.message);
        if (payload.status === 'error' && payload.message) {
          term.write(`\r\n\x1b[31m✗ ${payload.message}\x1b[0m\r\n`);
        }
      }
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
      offData();
      offStatus();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [tabId, setStatus]);

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

  return <div ref={containerRef} className="h-full w-full bg-bg p-2" />;
}
