import type { BalanceSnapshot } from "./types.js";

export interface BalanceReaderDeps {
  /** Injected to allow unit testing without real network calls. */
  loadHorizonAccount: (publicKey: string) => Promise<{ balances: Array<{ asset_type: string; balance: string }> }>;
  /** Runs a single Soroban simulateTransaction call, returning the parsed bigint (USDC base units). */
  simulateSacBalance: (usdcContractId: string, holderAddress: string) => Promise<bigint>;
  /** Runs a simulateTransaction against pool.get_root(), returning 64-char lowercase hex. */
  simulatePoolRoot: (poolContractId: string) => Promise<string>;
  /** Ms timeout for each individual call. Default 5000. */
  timeoutMs?: number;
  /** Injected clock for deterministic tests. Default Date.now. */
  now?: () => number;
}

export interface BalanceReaderConfig {
  facilitatorPublicKey: string;
  usdcContractId: string;
  poolContractId: string;
}

const DEFAULT_TIMEOUT_MS = 5000;

function withTimeout<T>(label: string, promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

/**
 * Decimal string → base-unit bigint. Horizon returns XLM balances as
 * e.g. "12.3456789"; we need 123456789 stroops. We do string math (no Number)
 * because XLM has 7 decimals and stroops exceed Number.MAX_SAFE_INTEGER at 10^9 XLM.
 */
function decimalToBaseUnits(value: string, decimals: number): bigint {
  const [whole, frac = ""] = value.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export async function readFacilitatorBalances(
  deps: Pick<BalanceReaderDeps, "loadHorizonAccount" | "timeoutMs">,
  publicKey: string,
): Promise<bigint> {
  const account = await withTimeout(
    "Horizon loadAccount",
    deps.loadHorizonAccount(publicKey),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const native = account.balances.find((b) => b.asset_type === "native");
  if (!native) {
    throw new Error("facilitator account has no native balance entry");
  }
  return decimalToBaseUnits(native.balance, 7);
}

export async function readPoolUsdcBalance(
  deps: Pick<BalanceReaderDeps, "simulateSacBalance" | "timeoutMs">,
  usdcContractId: string,
  poolContractId: string,
): Promise<bigint> {
  return withTimeout(
    "SAC balance",
    deps.simulateSacBalance(usdcContractId, poolContractId),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
}

export async function readPoolRoot(
  deps: Pick<BalanceReaderDeps, "simulatePoolRoot" | "timeoutMs">,
  poolContractId: string,
): Promise<string> {
  return withTimeout(
    "pool.get_root",
    deps.simulatePoolRoot(poolContractId),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
}

export async function readBalanceSnapshot(
  deps: BalanceReaderDeps,
  config: BalanceReaderConfig,
): Promise<BalanceSnapshot> {
  const [facilitatorXlmStroops, poolUsdcBaseUnits, poolRootHex] = await Promise.all([
    readFacilitatorBalances(deps, config.facilitatorPublicKey),
    readPoolUsdcBalance(deps, config.usdcContractId, config.poolContractId),
    readPoolRoot(deps, config.poolContractId),
  ]);
  return {
    facilitatorXlmStroops,
    poolUsdcBaseUnits,
    poolRootHex,
    observedAtMs: (deps.now ?? Date.now)(),
  };
}
