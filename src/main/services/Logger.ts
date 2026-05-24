import log from 'electron-log/main';

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

const SENSITIVE_KEYS = ['password', 'passphrase', 'privateKey', 'token'];

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.includes(k) ? '***' : redact(v);
    }
    return out;
  }
  return value;
}

export const logger = {
  info: (msg: string, meta?: unknown) => log.info(msg, meta !== undefined ? redact(meta) : ''),
  warn: (msg: string, meta?: unknown) => log.warn(msg, meta !== undefined ? redact(meta) : ''),
  error: (msg: string, meta?: unknown) => log.error(msg, meta !== undefined ? redact(meta) : ''),
  debug: (msg: string, meta?: unknown) => log.debug(msg, meta !== undefined ? redact(meta) : ''),
};
