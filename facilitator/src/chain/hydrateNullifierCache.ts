import type { Logger } from "pino";
import type { rpc as StellarRpc, xdr } from "@stellar/stellar-sdk";
import { scValToNative, xdr as XdrNS } from "@stellar/stellar-sdk";
import type { NullifierCache } from "../replay/cache.js";

export interface HydrateDeps {
  rpc: Pick<StellarRpc.Server, "getEvents" | "getLatestLedger">;
  cache: NullifierCache;
  poolContractId: string;
  /** How many ledgers back to scan. Default 120_960 (~7 days at 5s/ledger). */
  hydrateLedgers: number;
  logger?: Logger;
  /** Test hook. Default uses scValToNative decoding. */
  extractNullifiers?: (value: unknown) => string[];
}

export interface HydrateResult {
  hydratedCount: number;
  pagesScanned: number;
  startLedger: number;
  latestLedger: number;
}

/**
 * Scans Soroban events emitted by the pool contract over the configured
 * ledger window and rehydrates the NullifierCache with every nullifier that
 * has already been spent. Must be called once at boot before the facilitator
 * starts accepting /settle requests.
 *
 * The pool emits one event per `transact` call with topics[0] = Symbol("transact")
 * and a value containing the input nullifiers array (vec of bytes32).
 */
export async function hydrateNullifierCache(deps: HydrateDeps): Promise<HydrateResult> {
  const latest = await deps.rpc.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - deps.hydrateLedgers);

  const filter = {
    type: "contract" as const,
    contractIds: [deps.poolContractId],
    topics: [[XdrNS.ScVal.scvSymbol("transact").toXDR("base64")]],
  };

  const extractFn = deps.extractNullifiers ?? defaultExtractNullifiers;

  let cursor: string | undefined;
  let pagesScanned = 0;
  let hydratedCount = 0;
  const pendingEntries: Array<{ nullifierHex: string; txHash: string; seenAt: number }> = [];

  do {
    let page;
    try {
      if (cursor) {
        page = await deps.rpc.getEvents({ cursor, filters: [filter], limit: 200 });
      } else {
        page = await deps.rpc.getEvents({ startLedger, filters: [filter], limit: 200 });
      }
    } catch (err) {
      throw new Error(
        `event scan failed at cursor=${cursor ?? "initial"}: ${(err as Error).message}`,
      );
    }
    pagesScanned += 1;

    for (const event of page.events ?? []) {
      try {
        const nullifiers = extractFn(event.value);
        const txHash = event.txHash ?? "unknown";
        const seenAt = Date.now(); // Approximate — we don't have ledger close time in events.
        for (const nullifierHex of nullifiers) {
          pendingEntries.push({ nullifierHex, txHash, seenAt });
          hydratedCount += 1;
        }
      } catch (err) {
        deps.logger?.warn(
          { txHash: event.txHash, err: (err as Error).message },
          "skipping malformed pool.transact event",
        );
      }
    }

    cursor = page.cursor || undefined;
  } while (cursor);

  deps.cache.hydrate(pendingEntries);

  return {
    hydratedCount,
    pagesScanned,
    startLedger,
    latestLedger: latest.sequence,
  };
}

/**
 * Decodes the pool.transact event body and extracts the input_nullifiers
 * vec. The event body is an scvMap with a "nullifiers" key (see pool contract
 * emit_event). Each nullifier is 32 bytes — we hex-encode lowercase.
 */
function defaultExtractNullifiers(value: unknown): string[] {
  const native = scValToNative(value as xdr.ScVal) as { nullifiers?: Uint8Array[] };
  if (!native || !Array.isArray(native.nullifiers)) {
    throw new Error("event body has no nullifiers array");
  }
  return native.nullifiers.map((n) => Buffer.from(n).toString("hex").toLowerCase());
}
