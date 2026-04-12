import type { Logger } from "pino";
import type { NullifierEntry } from "./types.js";

export interface NullifierCacheOptions {
  logger?: Logger;
  /** Override for unit tests. Defaults to Date.now. */
  now?: () => number;
}

export class NullifierCache {
  private readonly store = new Map<string, NullifierEntry>();
  private readonly logger?: Logger;
  private readonly now: () => number;

  constructor(options: NullifierCacheOptions = {}) {
    this.logger = options.logger;
    this.now = options.now ?? Date.now;
  }

  /** Returns the current entry for the nullifier, or undefined if absent. */
  peek(nullifierHex: string): NullifierEntry | undefined {
    return this.store.get(this.normalize(nullifierHex));
  }

  /**
   * Atomic test-and-set. Returns true iff the nullifier was absent and has now
   * been marked in_flight. Returns false if the nullifier is already in_flight
   * or committed.
   *
   * TOCTOU safety: Map.has() + Map.set() are synchronous — no awaits between
   * the read and the write. Node.js single-threaded JS guarantees atomicity.
   */
  tryClaim(nullifierHex: string): boolean {
    const key = this.normalize(nullifierHex);
    if (this.store.has(key)) {
      return false;
    }
    this.store.set(key, { state: "in_flight", seenAt: this.now(), txHash: null });
    return true;
  }

  /** Marks an in_flight nullifier as committed with its confirmed tx hash. */
  commit(nullifierHex: string, txHash: string): void {
    const key = this.normalize(nullifierHex);
    const existing = this.store.get(key);
    if (!existing) {
      this.logger?.warn({ nullifierHex: key }, "commit() on absent nullifier — defensive fallback");
      this.store.set(key, { state: "committed", seenAt: this.now(), txHash });
      return;
    }
    if (existing.state === "committed") {
      this.logger?.warn(
        { nullifierHex: key, existingTx: existing.txHash, newTx: txHash },
        "commit() on already-committed nullifier — ignoring",
      );
      return;
    }
    existing.state = "committed";
    existing.txHash = txHash;
  }

  /** Removes an in_flight nullifier. No-op if already committed or absent. */
  release(nullifierHex: string): void {
    const key = this.normalize(nullifierHex);
    const existing = this.store.get(key);
    if (!existing) {
      return;
    }
    if (existing.state === "committed") {
      this.logger?.warn({ nullifierHex: key }, "release() on committed nullifier — refusing to remove");
      return;
    }
    this.store.delete(key);
  }

  /** Bulk-load historical committed nullifiers from RPC event scan (Plan 06). */
  hydrate(entries: Array<{ nullifierHex: string; txHash: string; seenAt: number }>): void {
    for (const entry of entries) {
      const key = this.normalize(entry.nullifierHex);
      this.store.set(key, { state: "committed", seenAt: entry.seenAt, txHash: entry.txHash });
    }
  }

  get size(): number {
    return this.store.size;
  }

  private normalize(nullifierHex: string): string {
    return nullifierHex.toLowerCase();
  }
}
