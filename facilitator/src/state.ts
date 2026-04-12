import type { Logger } from "pino";
import type { NullifierCache } from "./replay/cache.js";
import type { StellarClient } from "./chain/stellarClient.js";
import type { FacilitatorMode } from "./config/env.js";

export interface FacilitatorMetrics {
  totalSettlements: number;
  totalReplayRejections: number;
}

export interface FacilitatorState {
  mode: FacilitatorMode;
  cache: NullifierCache;
  client: StellarClient | null; // null in mock mode
  vKey: unknown | null; // set in mock mode
  metrics: FacilitatorMetrics;
  bootTimeMs: number;
  logger: Logger;
  /** Memoized latest-seen pool root for /health, updated on every readBalanceSnapshot. */
  lastSeenPoolRoot: string;
}

export function createInitialState(params: {
  mode: FacilitatorMode;
  cache: NullifierCache;
  client: StellarClient | null;
  vKey: unknown | null;
  logger: Logger;
}): FacilitatorState {
  return {
    ...params,
    metrics: { totalSettlements: 0, totalReplayRejections: 0 },
    bootTimeMs: Date.now(),
    lastSeenPoolRoot: "0".repeat(64),
  };
}
