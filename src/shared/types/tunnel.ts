export type TunnelKind = 'local' | 'remote' | 'dynamic';

export interface TunnelConfig {
  kind: TunnelKind;
  srcHost: string;
  srcPort: number;
  dstHost?: string;
  dstPort?: number;
}

export interface Tunnel extends TunnelConfig {
  id: string;
  sessionId: string;
  status: 'starting' | 'active' | 'closed' | 'error';
  error?: string;
}
