import { useEffect, useState } from 'react';
import { Cpu, HardDrive, MemoryStick } from 'lucide-react';
import type { RemoteMetrics } from '@shared/types/ipc';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errorMessage';

const percent = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toFixed(0)}%`;
const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
export function RemotePerformance({ tabId, attempt }: { tabId: string; attempt: number }) {
  const t = useI18n();
  const [metrics, setMetrics] = useState<RemoteMetrics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let busy = false;
    let firstSample = true;
    let timer: ReturnType<typeof setTimeout>;
    setMetrics(null);
    setError('');
    const poll = async () => {
      if (disposed || busy) return;
      clearTimeout(timer);
      if (document.visibilityState === 'hidden') {
        setMetrics(null);
        return;
      }
      busy = true;
      let delay = 5000;
      try {
        const data = await window.api.ssh.metrics(tabId);
        if (!disposed) {
          setMetrics(data);
          setError('');
        }
        if (firstSample && data.cpuPercent === null) delay = 1000;
        firstSample = false;
      } catch (e) {
        if (!disposed) {
          setMetrics(null);
          setError(errorMessage(e));
        }
        delay = 10000;
      } finally {
        busy = false;
        if (!disposed) timer = setTimeout(() => void poll(), delay);
      }
    };
    const visible = () => {
      void poll();
    };
    void poll();
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [tabId, attempt]);
  return (
    <div
      data-testid="remote-performance"
      className="flex shrink-0 items-center gap-3 font-mono"
      title={
        error ||
        `${t('metrics.hint')} · ${metrics ? new Date(metrics.sampledAt).toLocaleTimeString() : t('metrics.loading')}`
      }
    >
      <span
        className="flex items-center gap-1"
        title={metrics?.load1 != null ? `Load 1m: ${metrics.load1}` : undefined}
      >
        <Cpu className="h-3 w-3" />
        CPU {percent(metrics?.cpuPercent)}
      </span>
      <span
        className="flex items-center gap-1"
        title={
          metrics?.memory
            ? `${size(metrics.memory.used)} / ${size(metrics.memory.total)}`
            : undefined
        }
      >
        <MemoryStick className="h-3 w-3" />
        {t('metrics.memory')} {percent(metrics?.memory?.percent)}
      </span>
      <span
        className="flex items-center gap-1"
        title={
          metrics?.disk ? `/ · ${size(metrics.disk.used)} / ${size(metrics.disk.total)}` : undefined
        }
      >
        <HardDrive className="h-3 w-3" />/ {percent(metrics?.disk?.percent)}
      </span>
      {error && (
        <span className="text-warning" title={error}>
          {t('metrics.unavailable')}
        </span>
      )}
    </div>
  );
}
