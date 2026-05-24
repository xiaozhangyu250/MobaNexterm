export type SshAuth =
  | { kind: 'password'; password: string }
  | { kind: 'key'; privateKeyPath: string; passphrase?: string }
  | { kind: 'agent' };

export interface Session {
  id: string;
  name: string;
  groupId?: string;
  protocol: 'ssh';
  host: string;
  port: number;
  username: string;
  auth: SshAuth;
  jumpHostId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionGroup {
  id: string;
  name: string;
  parentId?: string;
}
