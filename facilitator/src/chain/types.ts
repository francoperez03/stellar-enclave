export interface BalanceSnapshot {
  /** Facilitator account XLM balance in stroops (1 XLM = 10_000_000 stroops). */
  facilitatorXlmStroops: bigint;
  /** Pool contract USDC balance in base units (1 USDC = 10_000_000 base units). */
  poolUsdcBaseUnits: bigint;
  /** Latest pool Merkle root (lowercase hex, 64 chars) for /health last_seen_pool_root. */
  poolRootHex: string;
  /** Unix ms of observation, used by /health uptime / freshness diagnostics. */
  observedAtMs: number;
}

export type SolvencyReason = "insolvent_facilitator_xlm" | "insolvent_pool_usdc";

export type SolvencyResult =
  | { ok: true }
  | {
      ok: false;
      reason: SolvencyReason;
      details: {
        required: string;
        available: string;
      };
    };
