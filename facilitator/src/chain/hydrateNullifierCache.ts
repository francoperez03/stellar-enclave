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
 * Maximum consecutive empty pages before we assume the scan window has no
 * matching events and exit early. Prevents infinite pagination against an
 * unused pool contract (RPC keeps advancing cursor even with zero results).
 */
const MAX_PAGES_WITHOUT_EVENTS = 20;

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
  const endLedger = latest.sequence;

  const filter = {
    type: "contract" as const,
    contractIds: [deps.poolContractId],
    topics: [[XdrNS.ScVal.scvSymbol("transact").toXDR("base64")]],
  };

  const extractFn = deps.extractNullifiers ?? defaultExtractNullifiers;

  // Resolve the effective startLedger, retrying once if the RPC rejects it due to
  // retention drift (error contains "startLedger must be within the ledger range: A - B").
  const RANGE_RE = /ledger range:\s*(\d+)\s*-\s*(\d+)/;
  let effectiveStartLedger = startLedger;

  deps.logger?.info(
    {
      startLedger: effectiveStartLedger,
      latestLedger: latest.sequence,
      spanLedgers: latest.sequence - effectiveStartLedger,
      approxDays: ((latest.sequence - effectiveStartLedger) * 5 / 86400).toFixed(1),
    },
    "hydrating nullifier cache",
  );

  let cursor: string | undefined;
  let pagesScanned = 0;
  let hydratedCount = 0;
  let consecutiveEmptyPages = 0;
  let isFirstCall = true;
  const pendingEntries: Array<{ nullifierHex: string; txHash: string; seenAt: number }> = [];

  do {
    let page;
    try {
      if (cursor) {
        page = await deps.rpc.getEvents({ cursor, filters: [filter], limit: 200 });
      } else {
        page = await deps.rpc.getEvents({
          startLedger: effectiveStartLedger,
          endLedger,
          filters: [filter],
          limit: 200,
        });
      }
    } catch (err) {
      const msg = (err as Error).message;
      // On the initial (non-cursor) call, attempt a single retry if the RPC
      // reports that our startLedger is outside its retention window.
      if (isFirstCall && !cursor && RANGE_RE.test(msg)) {
        const match = RANGE_RE.exec(msg);
        const oldestRetained = parseInt(match![1], 10);
        deps.logger?.warn(
          { requestedStart: effectiveStartLedger, oldestRetained },
          "hydrateNullifierCache: startLedger outside RPC retention window, retrying with oldest retained ledger",
        );
        effectiveStartLedger = oldestRetained;
        try {
          page = await deps.rpc.getEvents({
            startLedger: effectiveStartLedger,
            endLedger,
            filters: [filter],
            limit: 200,
          });
        } catch (retryErr) {
          throw new Error(
            `event scan failed at cursor=${cursor ?? "initial"}: ${(err as Error).message}`,
          );
        }
      } else {
        throw new Error(
          `event scan failed at cursor=${cursor ?? "initial"}: ${msg}`,
        );
      }
    }
    isFirstCall = false;
    pagesScanned += 1;

    const eventsInPage = page.events?.length ?? 0;

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

    // Throttle per-page logging: always log when there are events; otherwise
    // log every 25th empty page only.
    if (eventsInPage > 0 || pagesScanned % 25 === 0) {
      cursor = page.cursor || undefined;
      deps.logger?.info(
        {
          page: pagesScanned,
          eventsInPage,
          hydratedSoFar: hydratedCount,
          nextCursor: cursor ? cursor.slice(0, 12) + "..." : null,
        },
        "nullifier cache page scanned",
      );
    } else {
      cursor = page.cursor || undefined;
    }

    // Break early if the last event in this page is at or past endLedger —
    // we've consumed everything within the intended scan window.
    if (eventsInPage > 0) {
      const lastEvent = page.events[eventsInPage - 1];
      if (lastEvent.ledger >= endLedger) {
        break;
      }
      // Reset empty-page counter when we see real events.
      consecutiveEmptyPages = 0;
    } else {
      consecutiveEmptyPages += 1;
      // Safety cap: if we've seen many consecutive empty pages and no events at all,
      // the scan window almost certainly has no matching events (e.g., unused pool).
      if (consecutiveEmptyPages >= MAX_PAGES_WITHOUT_EVENTS && hydratedCount === 0) {
        deps.logger?.warn(
          {
            pagesScanned,
            consecutiveEmptyPages,
            endLedger,
          },
          "hydrateNullifierCache: RPC returned no events in consecutive empty pages — assuming scan window has no matching events; exiting hydration early",
        );
        break;
      }
    }
  } while (cursor);

  deps.cache.hydrate(pendingEntries);

  return {
    hydratedCount,
    pagesScanned,
    startLedger: effectiveStartLedger,
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
