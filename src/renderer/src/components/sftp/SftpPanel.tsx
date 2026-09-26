import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { SftpListEntry } from '@shared/types/ipc';
import {
  AlertCircle,
  Archive,
  ArrowDownToLine,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Copy,
  Download,
  File,
  Folder,
  FolderPlus,
  FolderOpen,
  Home,
  KeyRound,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  SquarePen,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { joinRemote, posixDirname, posixNormalize } from '@/lib/remotePath';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTerminalStore } from '@/stores/terminalStore';
import { DirectoryRequests } from '@/lib/directoryRequests';
import { isEditableTextFile } from './TextEditorDialog';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTime(ms: number | null): string {
  if (ms == null) return '-';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '-';
  }
}

function modeLabel(mode: number | null): string {
  if (mode == null) return '-';
  return `0${(mode & 0o777).toString(8)}`;
}

type TransferStatus = 'running' | 'done' | 'error';

interface TransferItem {
  taskId: string;
  label: string;
  direction: 'upload' | 'download';
  transferred: number;
  total: number;
  status: TransferStatus;
  message?: string;
  completedAt?: number;
  localPath?: string;
}

interface SftpPanelProps {
  tabId?: string | null;
  remoteCwd?: string;
  sftpAvailable?: boolean;
  sftpMessage?: string;
  connected?: boolean;
}

export function SftpPanel({
  tabId,
  remoteCwd,
  sftpAvailable = false,
  sftpMessage,
  connected = false,
}: SftpPanelProps) {
  const t = useI18n();
  const [remotePath, setRemotePath] = useState<string>('.');
  const [homePath, setHomePath] = useState<string | null>(null);
  const [pathDraft, setPathDraft] = useState('.');
  const [treeEntries, setTreeEntries] = useState<Record<string, SftpListEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [followTerminal, setFollowTerminal] = useState(true);
  const shellIntegration = useSettingsStore((s) => s.shellIntegration);
  const setShellIntegration = useSettingsStore((s) => s.setShellIntegration);
  const reconnectTab = useTerminalStore((s) => s.reconnectTab);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [dragTargetPath, setDragTargetPath] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const requests = useRef(new DirectoryRequests());
  const entriesRef = useRef(treeEntries);
  entriesRef.current = treeEntries;
  const contextRef = useRef(tabId);
  contextRef.current = tabId;
  const previousTabId = useRef<string | null | undefined>(undefined);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (previousTabId.current === tabId) return;
    previousTabId.current = tabId;
    setRemotePath(remoteCwd ?? '.');
    setPathDraft(remoteCwd ?? '.');
    setHomePath(null);
    setTreeEntries({});
    setExpanded(new Set());
    setLoadingPaths(new Set());
    setSelectedPath(null);
    setError(null);
    setFollowTerminal(true);
    setTransfers([]);
  }, [remoteCwd, tabId]);

  useEffect(() => {
    if (!remoteCwd || !followTerminal) return;
    setRemotePath(remoteCwd);
    setPathDraft(remoteCwd);
    setSelectedPath(null);
    setExpanded(new Set());
  }, [followTerminal, remoteCwd]);

  useEffect(() => {
    setPathDraft(remotePath);
  }, [remotePath]);

  const selectedItem = useMemo(() => {
    if (!selectedPath) return null;
    for (const [parent, entries] of Object.entries(treeEntries)) {
      const hit = entries.find((entry) => joinRemote(parent, entry.name) === selectedPath);
      if (hit) return { entry: hit, path: selectedPath, parent };
    }
    return null;
  }, [selectedPath, treeEntries]);
  const selectedEntry = selectedItem?.entry ?? null;
  const selectedFullPath = selectedItem?.path ?? null;

  useEffect(() => {
    const coordinator = requests.current;
    coordinator.reset();
    entriesRef.current = {};
    setTreeEntries({});
    setLoadingPaths(new Set());
    return () => coordinator.reset();
  }, [tabId, connected, sftpAvailable]);

  const loadDir = useCallback(
    async (path: string, force = false) => {
      if (!tabId || contextRef.current !== tabId || !sftpAvailable || !connected) return;
      if (!force && entriesRef.current[path]) return;
      setLoadingPaths((paths) => new Set(paths).add(path));
      await requests.current.run(
        path,
        () => window.api.sftp.list(tabId, path),
        (list) => {
          setTreeEntries((current) => ({ ...current, [path]: list }));
          setError(null);
        },
        (e) => {
          setError(e instanceof Error ? e.message : String(e));
        },
      );
      if (contextRef.current === tabId)
        setLoadingPaths((paths) => {
          const next = new Set(paths);
          next.delete(path);
          return next;
        });
    },
    [connected, sftpAvailable, tabId],
  );

  useEffect(() => {
    if (!connected || !sftpAvailable) return;
    let cancelled = false;
    let polling = false;
    const refresh = () => {
      if (polling || cancelled) return;
      if (document.visibilityState === 'hidden') return;
      const paths = new Set([remotePath, ...expanded]);
      // Sequential requests avoid flooding small SSH servers.
      polling = true;
      void (async () => {
        try {
          for (const path of paths) {
            if (cancelled) break;
            await loadDir(path, true);
          }
        } finally {
          polling = false;
        }
      })();
    };
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [connected, sftpAvailable, remotePath, expanded, loadDir]);

  useEffect(() => {
    if (!tabId || !sftpAvailable || !connected) return;
    let cancelled = false;
    void (async () => {
      try {
        const abs = await window.api.sftp.realpath(tabId, '.');
        if (cancelled) return;
        setHomePath(abs);
        setRemotePath((p) => (p === '.' ? abs : p));
      } catch {
        if (!cancelled) setHomePath(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, sftpAvailable, tabId]);

  useEffect(() => {
    if (!tabId || !sftpAvailable || !connected) return;
    setExpanded((paths) => new Set(paths).add(remotePath));
    void loadDir(remotePath);
  }, [connected, loadDir, remotePath, sftpAvailable, tabId]);

  const canGoUp = useMemo(() => joinRemote(remotePath, '..') !== remotePath, [remotePath]);

  const goTo = useCallback((path: string, follow = false) => {
    const normalized = posixNormalize(path);
    setFollowTerminal(follow);
    setRemotePath(normalized);
    setExpanded(new Set([normalized]));
    setSelectedPath(null);
  }, []);

  const goUp = () => goTo(joinRemote(remotePath, '..'), false);

  const goHome = () => {
    if (homePath) goTo(homePath, false);
  };

  const onPathKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!pathDraft.trim()) return;
    goTo(pathDraft.trim(), false);
  };

  const refreshRoot = useCallback(async () => {
    setLoading(true);
    await loadDir(remotePath, true);
    setLoading(false);
  }, [loadDir, remotePath]);

  const refreshDir = useCallback(
    async (path: string) => {
      setLoading(true);
      await loadDir(path, true);
      setLoading(false);
    },
    [loadDir],
  );

  useEffect(() => {
    const offProgress = window.events.on('sftp:progress', (p) => {
      if (p.tabId && p.tabId !== tabId) return;
      setTransfers((items) => {
        const next: TransferItem = {
          taskId: p.taskId,
          label: p.label ?? p.taskId,
          direction: p.direction ?? 'download',
          transferred: p.transferred,
          total: p.total,
          status: 'running',
          completedAt: undefined,
          message: undefined,
          localPath: p.localPath,
        };
        const existing = items.findIndex((i) => i.taskId === p.taskId);
        if (existing === -1) return [next, ...items].slice(0, 50);
        return items.map((i) =>
          i.taskId === p.taskId ? { ...i, ...next, localPath: p.localPath ?? i.localPath } : i,
        );
      });
    });
    const offDone = window.events.on('sftp:done', (p) => {
      if (p.tabId && p.tabId !== tabId) return;
      setTransfers((items) =>
        items.map((i) =>
          i.taskId === p.taskId
            ? {
                ...i,
                label: p.label ?? i.label,
                direction: p.direction ?? i.direction,
                transferred: i.total > 0 ? i.total : i.transferred,
                status: 'done',
                completedAt: Date.now(),
                localPath: p.localPath ?? i.localPath,
              }
            : i,
        ),
      );
      void refreshRoot();
    });
    const offError = window.events.on('sftp:error', (p) => {
      if (p.tabId && p.tabId !== tabId) return;
      setTransfers((items) => {
        const existing = items.findIndex((i) => i.taskId === p.taskId);
        const next: TransferItem = {
          taskId: p.taskId,
          label: p.label ?? p.taskId,
          direction: p.direction ?? 'download',
          transferred: 0,
          total: 0,
          status: 'error',
          message: p.message,
          completedAt: Date.now(),
          localPath: p.localPath,
        };
        if (existing === -1) return [next, ...items].slice(0, 50);
        return items.map((i) =>
          i.taskId === p.taskId
            ? {
                ...i,
                label: p.label ?? i.label,
                direction: p.direction ?? i.direction,
                status: 'error',
                message: p.message,
                completedAt: Date.now(),
                localPath: p.localPath ?? i.localPath,
              }
            : i,
        );
      });
    });
    return () => {
      offProgress();
      offDone();
      offError();
    };
  }, [refreshRoot, tabId]);

  const toggleDirectory = useCallback(
    async (path: string) => {
      const isExpanded = expanded.has(path);
      if (isExpanded) {
        setExpanded((paths) => {
          const next = new Set(paths);
          next.delete(path);
          return next;
        });
        return;
      }

      setExpanded((paths) => new Set(paths).add(path));
      await loadDir(path);
    },
    [expanded, loadDir],
  );

  const canEdit = (entry: SftpListEntry) =>
    !entry.isDirectory && !entry.isSymlink && isEditableTextFile(entry.name, entry.size);

  const openEditor = async (entry: SftpListEntry, fullPath: string) => {
    if (!tabId || !canEdit(entry)) return;
    try {
      await window.api.app.openEditor(tabId, fullPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRowActivate = (entry: SftpListEntry, fullPath: string) => {
    if (entry.isDirectory) {
      void toggleDirectory(fullPath);
      return;
    }
    if (canEdit(entry)) void openEditor(entry, fullPath);
  };

  const uploadLocalPaths = async (targetPath: string, localPaths: string[]) => {
    if (!tabId || localPaths.length === 0) return;
    try {
      await window.api.sftp.uploadPaths(tabId, targetPath, localPaths);
      await refreshDir(targetPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onUpload = async (targetPath = remotePath) => {
    if (!tabId) return;
    try {
      await window.api.sftp.upload(tabId, targetPath);
      await refreshDir(targetPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDownload = async (entry = selectedEntry, fullPath = selectedFullPath) => {
    if (!tabId || !entry || !fullPath) return;
    try {
      await window.api.sftp.download(tabId, fullPath, entry.isDirectory ? 'directory' : 'file');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onArchiveDownload = async (
    entry = selectedEntry,
    fullPath = selectedFullPath,
    format: 'zip' | 'tar.gz',
  ) => {
    if (!tabId || !entry?.isDirectory || !fullPath) return;

    const run = (sudoPassword?: string) =>
      window.api.sftp.downloadArchive(tabId, fullPath, format, sudoPassword);

    try {
      await run();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const permissionLike =
        /(permission denied|operation not permitted|sudo|not in sudoers|cannot open)/i.test(
          message,
        );
      if (!permissionLike || !window.confirm(t('sftp.archiveSudoRetry'))) {
        setError(message);
        return;
      }
      const sudoPassword = window.prompt(t('sftp.sudoPasswordPrompt'));
      if (!sudoPassword) {
        setError(message);
        return;
      }
      try {
        await run(sudoPassword);
      } catch (retryError) {
        setError(retryError instanceof Error ? retryError.message : String(retryError));
      }
    }
  };

  const onMkdir = async () => {
    if (!tabId) return;
    const name = window.prompt(t('sftp.mkdirPrompt'));
    if (!name?.trim()) return;
    try {
      await window.api.sftp.mkdir(tabId, joinRemote(remotePath, name.trim()));
      await refreshRoot();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDelete = async (entry = selectedEntry, fullPath = selectedFullPath) => {
    if (!tabId || !entry || !fullPath) return;
    if (!window.confirm(t('sftp.deleteConfirm', { name: entry.name }))) return;
    try {
      await window.api.sftp.remove(tabId, fullPath, entry.isDirectory ? 'directory' : 'file');
      setSelectedPath(null);
      await refreshDir(posixDirname(fullPath));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRename = async (entry = selectedEntry, fullPath = selectedFullPath) => {
    if (!tabId || !entry || !fullPath) return;
    const next = window.prompt(t('sftp.renamePrompt'), entry.name);
    if (!next?.trim() || next === entry.name) return;
    try {
      const parentPath = posixDirname(fullPath);
      await window.api.sftp.rename(tabId, fullPath, joinRemote(parentPath, next.trim()));
      setSelectedPath(joinRemote(parentPath, next.trim()));
      await refreshDir(parentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onChmod = async (entry = selectedEntry, fullPath = selectedFullPath) => {
    if (!tabId || !entry || !fullPath) return;
    const current = entry.mode == null ? '' : (entry.mode & 0o777).toString(8).padStart(3, '0');
    const next = window.prompt(t('sftp.permissionPrompt'), current);
    if (!next?.trim()) return;
    const value = next.trim();
    if (!/^[0-7]{3,4}$/.test(value)) {
      setError(t('sftp.permissionInvalid'));
      return;
    }
    try {
      await window.api.sftp.chmod(tabId, fullPath, parseInt(value, 8));
      await refreshDir(posixDirname(fullPath));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onCopyPath = async () => {
    if (!selectedFullPath) return;
    await copyPath(selectedFullPath);
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      setError(path);
    }
  };

  const rootEntries = treeEntries[remotePath] ?? [];

  const resetDrag = () => {
    dragDepth.current = 0;
    setDragActive(false);
    setDragTargetPath(null);
  };

  const eventLocalPaths = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.files)
      .map((file) => window.api.app.getPathForFile(file))
      .filter(Boolean);

  const onDragEnterRoot = (event: DragEvent<HTMLDivElement>) => {
    if (!connected || !sftpAvailable) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
    setDragTargetPath(remotePath);
  };

  const onDragOverRoot = (event: DragEvent<HTMLDivElement>) => {
    if (!connected || !sftpAvailable) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragTargetPath((current) => current ?? remotePath);
  };

  const onDragLeaveRoot = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) resetDrag();
  };

  const onDropRoot = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = dragTargetPath ?? remotePath;
    const localPaths = eventLocalPaths(event);
    resetDrag();
    void uploadLocalPaths(target, localPaths);
  };

  const renderTree = (parentPath: string, depth: number): React.ReactNode =>
    (treeEntries[parentPath] ?? []).map((entry) => {
      const fullPath = joinRemote(parentPath, entry.name);
      const isExpanded = expanded.has(fullPath);
      const isLoading = loadingPaths.has(fullPath);
      return (
        <div key={fullPath}>
          <FileContextMenu
            entry={entry}
            onOpen={() => onRowActivate(entry, fullPath)}
            onEdit={() => void openEditor(entry, fullPath)}
            editDisabled={!canEdit(entry)}
            onDownload={() => void onDownload(entry, fullPath)}
            onArchiveDownload={(format) => void onArchiveDownload(entry, fullPath, format)}
            onRename={() => void onRename(entry, fullPath)}
            onChmod={() => void onChmod(entry, fullPath)}
            onDelete={() => void onDelete(entry, fullPath)}
            onCopyPath={() => void copyPath(fullPath)}
          >
            <ExplorerRow
              name={entry.name}
              entry={entry}
              depth={depth}
              expanded={isExpanded}
              loading={isLoading}
              selected={selectedPath === fullPath}
              onClick={() => setSelectedPath(fullPath)}
              onContextMenu={() => setSelectedPath(fullPath)}
              onDoubleClick={() => onRowActivate(entry, fullPath)}
              onToggle={() => void toggleDirectory(fullPath)}
              onDragOver={(event) => {
                if (!entry.isDirectory) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'copy';
                setDragActive(true);
                setDragTargetPath(fullPath);
              }}
              onDrop={(event) => {
                if (!entry.isDirectory) return;
                event.preventDefault();
                event.stopPropagation();
                const localPaths = eventLocalPaths(event);
                resetDrag();
                void uploadLocalPaths(fullPath, localPaths);
              }}
            />
          </FileContextMenu>
          {entry.isDirectory && isExpanded ? renderTree(fullPath, depth + 1) : null}
        </div>
      );
    });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-bg-elevated/10">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Folder className="h-4 w-4 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-text">{t('sidebar.browser')}</div>
          <div className="truncate text-[10px] text-text-muted">
            {connected
              ? followTerminal
                ? remoteCwd
                  ? t('sftp.following')
                  : t('sftp.waitingDirectory')
                : t('sftp.manual')
              : t('sftp.noTab')}
          </div>
        </div>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" /> : null}
      </div>

      <PanelState connected={connected} sftpAvailable={sftpAvailable} message={sftpMessage}>
        <div className="flex shrink-0 flex-col border-b border-border">
          <div className="flex items-center gap-1 px-2 py-1.5">
            <IconButton title="Home" onClick={goHome} disabled={!homePath}>
              <Home className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="Parent directory" onClick={goUp} disabled={!canGoUp}>
              <ArrowUp className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title={t('common.refresh')} onClick={() => void refreshRoot()}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </IconButton>
            <IconButton
              title={t('sftp.followDirectory')}
              onClick={() => setFollowTerminal((v) => !v)}
              active={followTerminal}
            >
              <MapPin className="h-3.5 w-3.5" />
            </IconButton>
            <div className="mx-1 h-4 w-px bg-border" />
            <IconButton title={t('common.upload')} onClick={() => void onUpload()}>
              <Upload className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title={t('common.download')}
              onClick={() => void onDownload()}
              disabled={!selectedEntry}
            >
              <Download className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title={t('common.newFolder')} onClick={() => void onMkdir()}>
              <FolderPlus className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title={t('common.rename')}
              onClick={() => void onRename()}
              disabled={!selectedEntry}
            >
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              title={t('common.delete')}
              onClick={() => void onDelete()}
              disabled={!selectedEntry}
              danger
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>

          <div className="px-2 pb-2">
            <input
              aria-label={t('sftp.remotePath')}
              value={pathDraft}
              onChange={(e) => setPathDraft(e.target.value)}
              onKeyDown={onPathKeyDown}
              spellCheck={false}
              className="h-7 w-full rounded border border-border bg-bg px-2 font-mono text-[11px] text-text outline-none transition focus:border-accent/70"
            />
          </div>
        </div>

        {followTerminal && !remoteCwd ? (
          <div className="border-b border-border bg-bg px-3 py-2 text-[11px] leading-5 text-text-muted">
            <p>{t('sftp.directoryHelp')}</p>
            {!shellIntegration ? (
              <button
                type="button"
                className="mt-1 text-accent hover:underline"
                onClick={() => {
                  if (!tabId) return;
                  setShellIntegration(true);
                  void reconnectTab(tabId);
                }}
              >
                {t('sftp.enableDirectory')}
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="shrink-0 border-b border-danger/30 bg-danger/10 px-2 py-1 text-[11px] text-danger">
            {error}
          </div>
        ) : null}

        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div
              className="relative min-h-0 flex-1 overflow-auto px-1 py-1 text-xs"
              onDragEnter={onDragEnterRoot}
              onDragOver={onDragOverRoot}
              onDragLeave={onDragLeaveRoot}
              onDrop={onDropRoot}
            >
              {canGoUp ? (
                <ExplorerRow
                  name=".."
                  muted
                  depth={0}
                  onClick={() => setSelectedPath(null)}
                  onDoubleClick={goUp}
                />
              ) : null}
              {renderTree(remotePath, 0)}
              {!loading && !loadingPaths.has(remotePath) && rootEntries.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-text-muted">
                  {t('sftp.empty')}
                </div>
              ) : null}
              {dragActive ? (
                <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-md border border-dashed border-accent bg-accent/10 text-xs font-medium text-accent">
                  {dragTargetPath && dragTargetPath !== remotePath
                    ? `${t('sftp.dropInto')} ${dragTargetPath}`
                    : t('sftp.dropToUpload')}
                </div>
              ) : null}
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <MenuContent>
              <MenuItem
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                onSelect={() => void refreshRoot()}
              >
                {t('common.refresh')}
              </MenuItem>
              <MenuItem icon={<Upload className="h-3.5 w-3.5" />} onSelect={() => void onUpload()}>
                {t('sftp.uploadHere')}
              </MenuItem>
              <MenuItem
                icon={<FolderPlus className="h-3.5 w-3.5" />}
                onSelect={() => void onMkdir()}
              >
                {t('common.newFolder')}
              </MenuItem>
              <ContextMenu.Separator className="my-1 h-px bg-border" />
              <MenuItem
                icon={<Download className="h-3.5 w-3.5" />}
                onSelect={() => void onDownload()}
                disabled={!selectedEntry}
              >
                {t('common.download')}
              </MenuItem>
              <MenuItem
                icon={<SquarePen className="h-3.5 w-3.5" />}
                onSelect={() => {
                  if (selectedEntry && selectedFullPath)
                    void openEditor(selectedEntry, selectedFullPath);
                }}
                disabled={!selectedEntry || !canEdit(selectedEntry)}
              >
                {t('common.edit')}
              </MenuItem>
              <ArchiveSubMenu
                disabled={!selectedEntry?.isDirectory}
                onSelect={(format) =>
                  void onArchiveDownload(selectedEntry, selectedFullPath, format)
                }
              />
              <MenuItem
                icon={<KeyRound className="h-3.5 w-3.5" />}
                onSelect={() => void onChmod()}
                disabled={!selectedEntry}
              >
                {t('common.permissions')}
              </MenuItem>
              <MenuItem
                icon={<Copy className="h-3.5 w-3.5" />}
                onSelect={() => void onCopyPath()}
                disabled={!selectedEntry}
              >
                {t('common.copyPath')}
              </MenuItem>
              <MenuItem
                icon={<Pencil className="h-3.5 w-3.5" />}
                onSelect={() => void onRename()}
                disabled={!selectedEntry}
              >
                {t('common.rename')}
              </MenuItem>
              <ContextMenu.Separator className="my-1 h-px bg-border" />
              <MenuItem
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onSelect={() => void onDelete()}
                disabled={!selectedEntry}
                danger
              >
                {t('common.delete')}
              </MenuItem>
            </MenuContent>
          </ContextMenu.Portal>
        </ContextMenu.Root>

        <TransferList transfers={transfers} />
      </PanelState>
    </div>
  );
}

function PanelState({
  connected,
  sftpAvailable,
  message,
  children,
}: {
  connected: boolean;
  sftpAvailable: boolean;
  message?: string;
  children: React.ReactNode;
}) {
  const t = useI18n();

  if (!connected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-5 text-center text-xs text-text-muted">
        <ArrowDownToLine className="h-5 w-5 text-text-muted" />
        <p>{t('sftp.openSession')}</p>
      </div>
    );
  }

  if (!sftpAvailable) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-5 text-center text-xs text-text-muted">
        <AlertCircle className="h-5 w-5 text-accent" />
        <p>{t('sftp.unavailable')}</p>
        {message ? <p className="font-mono text-[10px] text-danger/90">{message}</p> : null}
      </div>
    );
  }

  return <>{children}</>;
}

function ExplorerRow({
  name,
  entry,
  depth = 0,
  expanded = false,
  loading = false,
  selected = false,
  muted = false,
  onClick,
  onContextMenu,
  onDoubleClick,
  onToggle,
  onDragOver,
  onDrop,
}: {
  name: string;
  entry?: SftpListEntry;
  depth?: number;
  expanded?: boolean;
  loading?: boolean;
  selected?: boolean;
  muted?: boolean;
  onClick: () => void;
  onContextMenu?: () => void;
  onDoubleClick: () => void;
  onToggle?: () => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
}) {
  const details = entry
    ? entry.isDirectory
      ? modeLabel(entry.mode)
      : `${formatBytes(entry.size)}  ${modeLabel(entry.mode)}`
    : '';

  return (
    <button
      type="button"
      title={entry ? `${name}\n${formatTime(entry.mtimeMs)}` : name}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'group flex h-7 w-full items-center gap-1 rounded text-left transition',
        selected ? 'bg-accent/20 text-text' : 'text-text-muted hover:bg-bg hover:text-text',
        muted && 'font-mono text-text-muted',
      )}
      style={{ paddingLeft: depth * 12 + 6 }}
    >
      {entry?.isDirectory ? (
        <span
          role="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onToggle?.();
          }}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-bg-elevated"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      {entry ? <EntryIcon entry={entry} /> : <ArrowUp className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {details ? (
        <span className="hidden shrink-0 font-mono text-[10px] text-text-muted group-hover:block">
          {details}
        </span>
      ) : null}
    </button>
  );
}

function FileContextMenu({
  entry,
  children,
  onOpen,
  onEdit,
  editDisabled,
  onDownload,
  onArchiveDownload,
  onRename,
  onChmod,
  onDelete,
  onCopyPath,
}: {
  entry: SftpListEntry;
  children: React.ReactNode;
  onOpen: () => void;
  onEdit: () => void;
  editDisabled: boolean;
  onDownload: () => void;
  onArchiveDownload: (format: 'zip' | 'tar.gz') => void;
  onRename: () => void;
  onChmod: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
}) {
  const t = useI18n();

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <MenuContent>
          {entry.isDirectory ? (
            <MenuItem icon={<Folder className="h-3.5 w-3.5" />} onSelect={onOpen}>
              {t('common.open')}
            </MenuItem>
          ) : null}
          {!entry.isDirectory ? (
            <MenuItem
              icon={<SquarePen className="h-3.5 w-3.5" />}
              onSelect={onEdit}
              disabled={editDisabled}
            >
              {t('common.edit')}
            </MenuItem>
          ) : null}
          <MenuItem icon={<Download className="h-3.5 w-3.5" />} onSelect={onDownload}>
            {entry.isDirectory ? t('sftp.downloadDirectory') : t('common.download')}
          </MenuItem>
          {entry.isDirectory ? <ArchiveSubMenu onSelect={onArchiveDownload} /> : null}
          <MenuItem icon={<KeyRound className="h-3.5 w-3.5" />} onSelect={onChmod}>
            {t('common.permissions')}
          </MenuItem>
          <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onSelect={onCopyPath}>
            {t('common.copyPath')}
          </MenuItem>
          <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onSelect={onRename}>
            {t('common.rename')}
          </MenuItem>
          <ContextMenu.Separator className="my-1 h-px bg-border" />
          <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} onSelect={onDelete} danger>
            {t('common.delete')}
          </MenuItem>
        </MenuContent>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function MenuContent({ children }: { children: React.ReactNode }) {
  return (
    <ContextMenu.Content className="z-50 min-w-[180px] rounded-md border border-border bg-bg-elevated p-1 text-xs text-text shadow-overlay">
      {children}
    </ContextMenu.Content>
  );
}

function MenuItem({
  icon,
  children,
  onSelect,
  disabled = false,
  danger = false,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        danger
          ? 'text-danger data-[highlighted]:bg-danger/10'
          : 'data-[highlighted]:bg-bg data-[highlighted]:text-text',
      )}
    >
      {icon}
      <span>{children}</span>
    </ContextMenu.Item>
  );
}

function ArchiveSubMenu({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (format: 'zip' | 'tar.gz') => void;
}) {
  const t = useI18n();
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger
        disabled={disabled}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
          'data-[highlighted]:bg-bg data-[highlighted]:text-text',
        )}
      >
        <Archive className="h-3.5 w-3.5" />
        <span className="flex-1">{t('sftp.archiveDownload')}</span>
        <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent className="z-50 min-w-[140px] rounded-md border border-border bg-bg-elevated p-1 text-xs text-text shadow-overlay">
          <MenuItem icon={<Archive className="h-3.5 w-3.5" />} onSelect={() => onSelect('tar.gz')}>
            tar.gz
          </MenuItem>
          <MenuItem icon={<Archive className="h-3.5 w-3.5" />} onSelect={() => onSelect('zip')}>
            zip
          </MenuItem>
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

function IconButton({
  title,
  children,
  onClick,
  disabled = false,
  active = false,
  danger = false,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded border border-transparent text-text-muted transition',
        'hover:border-border hover:bg-bg hover:text-text disabled:pointer-events-none disabled:opacity-30',
        active && 'border-accent/40 bg-accent/10 text-accent',
        danger && 'hover:text-danger',
      )}
    >
      {children}
    </button>
  );
}

function EntryIcon({ entry }: { entry: SftpListEntry }) {
  if (entry.isDirectory) return <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />;
  if (entry.isSymlink) return <Link2 className="h-3.5 w-3.5 shrink-0 text-text-muted" />;
  return <File className="h-3.5 w-3.5 shrink-0 text-text-muted" />;
}

function TransferList({ transfers }: { transfers: TransferItem[] }) {
  const t = useI18n();
  const [now, setNow] = useState(() => Date.now());
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (transfers.length === 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [transfers.length]);

  const visible = transfers
    .filter(
      (item) => item.status === 'running' || !item.completedAt || now - item.completedAt < 5000,
    )
    .slice(0, 4);
  const hiddenCount = Math.max(0, transfers.length - visible.length);

  if (transfers.length === 0) {
    return (
      <div className="flex h-8 shrink-0 items-center border-t border-border px-2 text-[10px] text-text-muted">
        {t('sftp.transferIdle')}
      </div>
    );
  }

  return (
    <div className="relative shrink-0 border-t border-border bg-bg/35">
      <div className={cn(visible.length > 0 ? 'max-h-44 overflow-auto' : 'h-8')}>
        {visible.length > 0 ? (
          visible.map((item) => <TransferRow key={item.taskId} item={item} />)
        ) : (
          <div className="flex h-8 items-center justify-between px-2 text-[10px] text-text-muted">
            <span>{t('sftp.transferIdle')}</span>
            <span>{t('sftp.transferHistory', { count: transfers.length })}</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDetailsOpen((open) => !open)}
        className="flex h-7 w-full items-center justify-between border-t border-border/60 px-2 text-left text-[10px] text-text-muted transition hover:bg-bg hover:text-text"
      >
        <span>{t('sftp.transferQueue')}</span>
        <span>
          {hiddenCount > 0
            ? `+${hiddenCount}`
            : t('sftp.transferHistory', { count: transfers.length })}
        </span>
      </button>
      {detailsOpen ? (
        <div className="absolute inset-x-1 bottom-full z-40 mb-1 max-h-72 overflow-auto rounded-md border border-border bg-bg-elevated p-1 shadow-overlay">
          <div className="sticky top-0 z-10 flex h-8 items-center justify-between border-b border-border bg-bg-elevated px-2 text-[10px] text-text-muted">
            <span>{t('sftp.transferDetails')}</span>
            <button
              type="button"
              title={t('common.close')}
              onClick={() => setDetailsOpen(false)}
              className="rounded p-1 transition hover:bg-bg hover:text-text"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {transfers.map((item) => (
            <TransferRow key={`history-${item.taskId}`} item={item} compact showActions />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TransferRow({
  item,
  compact = false,
  showActions = false,
}: {
  item: TransferItem;
  compact?: boolean;
  showActions?: boolean;
}) {
  const pct = item.total > 0 ? Math.min(100, Math.round((item.transferred / item.total) * 100)) : 0;
  const canOpenLocation = showActions && item.direction === 'download' && item.localPath;
  return (
    <div
      className={cn('border-b border-border/60 px-2 last:border-b-0', compact ? 'py-1' : 'py-1.5')}
    >
      <div className="flex items-center gap-2 text-[10px]">
        {item.status === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin text-text-muted" />
        ) : item.status === 'done' ? (
          <CheckCircle2 className="h-3 w-3 text-success" />
        ) : (
          <AlertCircle className="h-3 w-3 text-danger" />
        )}
        <span className="shrink-0 uppercase text-text-muted">{item.direction}</span>
        <span className="min-w-0 flex-1 truncate text-text">{item.label}</span>
        {canOpenLocation ? (
          <button
            type="button"
            title={item.localPath}
            onClick={() => void window.api.app.showItemInFolder(item.localPath ?? '')}
            className="rounded p-1 text-text-muted transition hover:bg-bg hover:text-text"
          >
            <FolderOpen className="h-3 w-3" />
          </button>
        ) : null}
        <span className="font-mono text-text-muted">
          {item.status === 'running' ? `${pct}%` : item.status}
        </span>
      </div>
      {!compact ? (
        <div className="mt-1 h-1 overflow-hidden rounded bg-border">
          <div
            className={cn(
              'h-full transition-all',
              item.status === 'error'
                ? 'bg-danger'
                : item.status === 'done'
                  ? 'bg-success'
                  : 'bg-accent',
            )}
            style={{ width: `${item.status === 'done' ? 100 : pct}%` }}
          />
        </div>
      ) : null}
      {item.message ? (
        <div className="mt-1 truncate text-[10px] text-danger">{item.message}</div>
      ) : null}
    </div>
  );
}
