import type { IpcApi, IpcEventMap, IpcEventName } from '@shared/types/ipc';

declare global {
  interface Window {
    api: IpcApi;
    events: {
      on<E extends IpcEventName>(name: E, listener: (payload: IpcEventMap[E]) => void): () => void;
    };
  }
}

export {};
