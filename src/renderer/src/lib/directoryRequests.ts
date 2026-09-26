/** One request per path, with generation isolation across sessions/reconnects. */
export class DirectoryRequests {
  private generation = 0;
  private pending = new Map<string, Promise<void>>();
  reset(): void {
    this.generation++;
    this.pending.clear();
  }
  run<T>(
    path: string,
    fetch: () => Promise<T>,
    apply: (value: T) => void,
    fail: (error: unknown) => void,
  ): Promise<void> {
    const existing = this.pending.get(path);
    if (existing) return existing;
    const generation = this.generation;
    const request = Promise.resolve()
      .then(fetch)
      .then(
        (value) => {
          if (generation === this.generation) apply(value);
        },
        (error: unknown) => {
          if (generation === this.generation) fail(error);
        },
      )
      .finally(() => {
        if (this.pending.get(path) === request) this.pending.delete(path);
      });
    this.pending.set(path, request);
    return request;
  }
}
