export type NullifierState = "in_flight" | "committed";

export interface NullifierEntry {
  /** Current lifecycle state. */
  state: NullifierState;
  /** Unix ms when this nullifier was first observed by the cache. */
  seenAt: number;
  /** Stellar tx hash once committed. Null while in_flight. */
  txHash: string | null;
}
