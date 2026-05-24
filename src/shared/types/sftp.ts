export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mtime: number;
  mode: number;
}

export type TransferDirection = 'upload' | 'download';

export interface TransferTask {
  id: string;
  sessionId: string;
  direction: TransferDirection;
  localPath: string;
  remotePath: string;
  total: number;
  transferred: number;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
}
