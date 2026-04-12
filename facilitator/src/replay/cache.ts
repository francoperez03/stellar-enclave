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
    throw new Error("not implemented");
  }

  /**
   * Atomic test-and-set. Returns true iff the nullifier was absent and has now
   * been marked in_flight. Returns false if the nullifier is already in_flight
   * or committed.
   */
  tryClaim(nullifierHex: string): boolean {
    throw new Error("not implemented");
  }

  /** Marks an in_flight nullifier as committed with its confirmed tx hash. */
  commit(nullifierHex: string, txHash: string): void {
    throw new Error("not implemented");
  }

  /** Removes an in_flight nullifier. No-op if already committed or absent. */
  release(nullifierHex: string): void {
    throw new Error("not implemented");
  }

  /** Bulk-load historical committed nullifiers from RPC event scan (Plan 06). */
  hydrate(entries: Array<{ nullifierHex: string; txHash: string; seenAt: number }>): void {
    throw new Error("not implemented");
  }

  get size(): number {
    return this.store.size;
  }

  private normalize(nullifierHex: string): string {
    return nullifierHex.toLowerCase();
  }
}
