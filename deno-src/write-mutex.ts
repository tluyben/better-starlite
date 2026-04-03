/**
 * AsyncWriteMutex — serializes concurrent async writes to a single SQLite connection.
 *
 * SQLite connections are not re-entrant: if two async callers both issue writes
 * "simultaneously" (both suspended at `await`, both scheduled on the JS event loop),
 * multi-step operations like BEGIN…COMMIT can interleave and corrupt state.
 *
 * This mutex ensures that only one write-path runs at a time.  Reads (get/all/iterate)
 * bypass it entirely — WAL mode allows concurrent reads without locking.
 */
export class AsyncWriteMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async serialize<T>(fn: () => Promise<T>): Promise<T> {
    await this._acquire();
    try {
      return await fn();
    } finally {
      this._release();
    }
  }

  private _acquire(): Promise<void> {
    return new Promise(resolve => {
      if (!this.locked) { this.locked = true; resolve(); }
      else { this.queue.push(resolve); }
    });
  }

  private _release(): void {
    const next = this.queue.shift();
    if (next) next(); else this.locked = false;
  }
}
