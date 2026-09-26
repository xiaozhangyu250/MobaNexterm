import { Save, X, Search, Replace, ChevronDown, ChevronUp } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { useI18n } from '@/lib/i18n';
import { findText, replaceText } from '@/lib/textSearch';
import { cn } from '@/lib/utils';

interface TextEditorDialogProps {
  open: boolean;
  path: string | null;
  content: string;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  error?: string | null;
  onChange: (content: string) => void;
  onSave: () => void;
  onClose: () => void;
}

type Language =
  | 'javascript'
  | 'python'
  | 'shell'
  | 'json'
  | 'yaml'
  | 'css'
  | 'html'
  | 'config'
  | 'plain';

const keywordSets: Record<Language, Set<string>> = {
  javascript: new Set([
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'default',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'import',
    'let',
    'new',
    'return',
    'switch',
    'throw',
    'try',
    'typeof',
    'var',
    'while',
  ]),
  python: new Set([
    'and',
    'as',
    'class',
    'def',
    'elif',
    'else',
    'except',
    'False',
    'finally',
    'for',
    'from',
    'if',
    'import',
    'in',
    'is',
    'None',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'True',
    'try',
    'while',
    'with',
  ]),
  shell: new Set([
    'case',
    'do',
    'done',
    'elif',
    'else',
    'esac',
    'export',
    'fi',
    'for',
    'function',
    'if',
    'in',
    'then',
    'while',
  ]),
  json: new Set(['true', 'false', 'null']),
  yaml: new Set(['true', 'false', 'null', 'yes', 'no']),
  css: new Set(['@media', '@import', '@keyframes', 'from', 'to']),
  html: new Set([]),
  config: new Set(['true', 'false', 'yes', 'no', 'on', 'off']),
  plain: new Set([]),
};

const textLikeExtensions = new Set([
  'bash',
  'c',
  'cc',
  'conf',
  'config',
  'cpp',
  'cs',
  'css',
  'csv',
  'env',
  'go',
  'h',
  'hpp',
  'htm',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'jsx',
  'log',
  'lua',
  'md',
  'mjs',
  'php',
  'properties',
  'py',
  'rb',
  'rs',
  'service',
  'sh',
  'sql',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
]);

const textLikeNames = new Set([
  '.bash_profile',
  '.bashrc',
  '.env',
  '.gitignore',
  '.profile',
  '.ssh_config',
  'Dockerfile',
  'Makefile',
  'authorized_keys',
  'config',
  'hosts',
  'known_hosts',
  'nginx.conf',
  'ssh_config',
  'sshd_config',
]);

export function isEditableTextFile(name: string, size: number): boolean {
  if (size > 2 * 1024 * 1024) return false;
  if (textLikeNames.has(name)) return true;
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  return Boolean(ext && textLikeExtensions.has(ext));
}

export function TextEditorDialog({
  open,
  path,
  content,
  dirty,
  loading,
  saving,
  error,
  onChange,
  onSave,
  onClose,
}: TextEditorDialogProps) {
  const t = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [cursor, setCursor] = useState(0);
  const matches = useMemo(() => findText(content, query, matchCase), [content, query, matchCase]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const language = useMemo(() => languageFromPath(path ?? ''), [path]);
  const highlighted = useMemo(
    () => (content.length > 128 * 1024 ? [content] : highlightContent(content, language)),
    [content, language],
  );

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, path]);

  const onScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  const find = (backwards = false) => {
    const area = textareaRef.current;
    if (!area || matches.length === 0) return;
    const match = backwards
      ? ([...matches].reverse().find((m) => m.start < area.selectionStart) ??
        matches[matches.length - 1])
      : (matches.find((m) => m.start >= area.selectionEnd) ?? matches[0]);
    area.focus();
    area.setSelectionRange(match.start, match.end);
    setCursor(match.start);
    area.scrollTop = Math.max(0, (content.slice(0, match.start).split('\n').length - 3) * 20);
    if (highlightRef.current) highlightRef.current.scrollTop = area.scrollTop;
  };
  const replace = (all: boolean) => {
    const area = textareaRef.current;
    if (!area || loading || saving) return;
    const selected = matches.find(
      (m) => m.start === area.selectionStart && m.end === area.selectionEnd,
    );
    if (all) onChange(replaceText(content, matches, replacement));
    else if (selected) onChange(replaceText(content, [selected], replacement));
    else find();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!loading && !saving) onSave();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && ['f', 'h'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      setSearchOpen(true);
      return;
    }
    if (!loading && event.key === 'Tab') {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = `${content.slice(0, start)}  ${content.slice(end)}`;
      onChange(next);
      window.requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-text">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-bg-elevated/70 px-3">
        <h1 className="min-w-0 flex-1 truncate text-xs font-semibold">
          {path ?? t('editor.untitled')}
        </h1>
        <div className="shrink-0 font-mono text-[10px] uppercase text-text-muted">{language}</div>
        {dirty ? <div className="h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
        <button
          title={t('terminal.search')}
          onClick={() => setSearchOpen((v) => !v)}
          className="p-1 text-text-muted"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={loading || saving || !dirty}
          className="flex h-7 items-center gap-1.5 rounded border border-border bg-bg px-2 text-xs text-text-muted transition hover:bg-bg-elevated hover:text-text disabled:pointer-events-none disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          {loading ? t('editor.loading') : saving ? t('editor.saving') : t('editor.save')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1.5 text-text-muted transition hover:bg-bg-elevated hover:text-text"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {searchOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-elevated px-3 py-2 text-xs">
          <input
            autoFocus
            aria-label={t('terminal.search')}
            placeholder={t('terminal.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') find(e.shiftKey);
              if (e.key === 'Escape') setSearchOpen(false);
            }}
            className="rounded border border-border bg-bg px-2 py-1.5"
          />
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
            />
            Aa
          </label>
          <span className="text-text-muted">{matches.length}</span>
          <button title={t('search.previous')} onClick={() => find(true)}>
            <ChevronUp className="h-4 w-4" />
          </button>
          <button title={t('search.next')} onClick={() => find()}>
            <ChevronDown className="h-4 w-4" />
          </button>
          <input
            aria-label={t('search.replace')}
            placeholder={t('search.replace')}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            className="rounded border border-border bg-bg px-2 py-1.5"
          />
          <button
            disabled={loading || saving}
            onClick={() => replace(false)}
            className="flex items-center gap-1"
          >
            <Replace className="h-4 w-4" />
            {t('search.replace')}
          </button>
          <button disabled={loading || saving} onClick={() => replace(true)}>
            {t('search.replaceAll')}
          </button>
          <button
            aria-label={t('common.close')}
            onClick={() => setSearchOpen(false)}
            className="ml-auto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="shrink-0 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-xs text-danger">
          {error}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 bg-bg">
        <pre
          ref={highlightRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-4 font-mono text-[12px] leading-5 text-text"
          style={{ tabSize: 2 }}
        >
          {highlighted}
        </pre>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          aria-label={path ?? t('editor.untitled')}
          spellCheck={false}
          disabled={loading}
          wrap="off"
          style={{ tabSize: 2 }}
          className={cn(
            'absolute inset-0 resize-none overflow-auto whitespace-pre border-0 bg-transparent p-4 font-mono text-[12px] leading-5 outline-none',
            'text-transparent caret-accent selection:bg-accent/35 disabled:cursor-wait',
          )}
        />
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-bg-elevated/50 px-3 text-[10px] text-text-muted">
        <span>{t('editor.saveHint')}</span>
        <span>
          Ln {content.slice(0, cursor).split('\n').length}, Col{' '}
          {cursor - content.lastIndexOf('\n', Math.max(0, cursor - 1))} · UTF-8 ·{' '}
          {content.split('\n').length} lines
        </span>
      </div>
    </div>
  );
}

function languageFromPath(path: string): Language {
  const name = path.split('/').pop() ?? path;
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext ?? '')) return 'javascript';
  if (ext === 'py') return 'python';
  if (['sh', 'bash'].includes(ext ?? '') || name.startsWith('.bash')) return 'shell';
  if (ext === 'json') return 'json';
  if (['yaml', 'yml'].includes(ext ?? '')) return 'yaml';
  if (ext === 'css') return 'css';
  if (['html', 'htm', 'xml', 'vue'].includes(ext ?? '')) return 'html';
  if (
    ['conf', 'config', 'ini', 'env', 'properties', 'service', 'toml'].includes(ext ?? '') ||
    textLikeNames.has(name)
  ) {
    return 'config';
  }
  return 'plain';
}

function highlightContent(content: string, language: Language): ReactNode[] {
  const lines = content.split('\n');
  return lines.flatMap((line, index) => {
    const nodes = highlightLine(line, language, index);
    if (index < lines.length - 1) nodes.push('\n');
    return nodes;
  });
}

function highlightLine(line: string, language: Language, lineIndex: number): ReactNode[] {
  if (line.length === 0) return [<span key={`${lineIndex}-empty`}>&nbsp;</span>];

  const marker = commentMarker(language);
  const commentIndex = marker ? line.indexOf(marker) : -1;
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : '';
  const nodes = tokenizeCode(code, language, `${lineIndex}`);
  if (comment) {
    nodes.push(
      <span key={`${lineIndex}-comment`} className="text-text-muted">
        {comment}
      </span>,
    );
  }
  return nodes;
}

function commentMarker(language: Language): string | null {
  if (language === 'javascript' || language === 'css') return '//';
  if (language === 'python' || language === 'shell' || language === 'yaml' || language === 'config')
    return '#';
  return null;
}

function tokenizeCode(code: string, language: Language, keyPrefix: string): ReactNode[] {
  const tokens =
    code.match(
      /("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`|\b\d+(?:\.\d+)?\b|[A-Za-z_@$-][\w@$-]*|[{}()[\].,;:+*/%<>=!?|-]+|\s+|.)/g,
    ) ?? [];
  const keywords = keywordSets[language];
  return tokens.map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (/^["'`]/.test(token)) {
      return (
        <span key={key} className="text-success">
          {token}
        </span>
      );
    }
    if (/^\d/.test(token)) {
      return (
        <span key={key} className="text-accent">
          {token}
        </span>
      );
    }
    if (keywords.has(token)) {
      return (
        <span key={key} className="text-accent">
          {token}
        </span>
      );
    }
    if (
      (language === 'json' || language === 'yaml' || language === 'config') &&
      /^[A-Za-z_@$-][\w@$-]*$/.test(token)
    ) {
      return (
        <span key={key} className="text-[#d68eea]">
          {token}
        </span>
      );
    }
    if (/^[{}()[\].,;:+*/%<>=!?|-]+$/.test(token)) {
      return (
        <span key={key} className="text-text-muted">
          {token}
        </span>
      );
    }
    return <span key={key}>{token}</span>;
  });
}
