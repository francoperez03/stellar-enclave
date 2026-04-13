/**
 * Env surface for the Enclave facilitator. One source of truth for every
 * environment variable read by Phase 2. Parsing and validation happen once
 * via `Env.validate()` at boot; all subsequent reads are synchronous and typed.
 *
 * Why a class with static getters (and not just exported constants):
 * - Lazy init means tests can mutate process.env and call `Env.reset()`.
 * - Typed getters force callers through a single validation surface.
 * - Matches the pattern in pocs/x402-stellar/examples/facilitator/src/config/env.ts.
 */
import { resolvePathFromRepoRoot } from "./paths.js";
export type FacilitatorMode = "on_chain" | "mock";

interface ParsedEnv {
  mode: FacilitatorMode;
  port: number;
  corsOrigins: string[];
  stellarRpcUrl: string;
  stellarHorizonUrl: string;
  stellarNetworkPassphrase: string;
  poolContractId: string;
  usdcContractId: string;
  keyPath: string;
  minXlmStroops: bigint;
  maxTransactionFeeStroops: number;
  cacheHydrateLedgers: number;
  circuitVkeyPath: string;
  logLevel: string;
  settlementsPath: string;
}

const REQUIRED_VARS = [
  "STELLAR_RPC_URL",
  "STELLAR_HORIZON_URL",
  "STELLAR_NETWORK_PASSPHRASE",
  "POOL_CONTRACT_ID",
  "USDC_CONTRACT_ID",
  "FACILITATOR_KEY_PATH",
] as const;

function readString(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing required env var: ${name}`);
  }
  return value;
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`env var ${name} must be a non-negative integer (got: ${raw})`);
  }
  return parseInt(raw, 10);
}

function readBigint(name: string, fallback: bigint): bigint {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`env var ${name} must be a non-negative integer (got: ${raw})`);
  }
  return BigInt(raw);
}

function readMode(): FacilitatorMode {
  const raw = process.env.FACILITATOR_MODE ?? "on_chain";
  if (raw !== "on_chain" && raw !== "mock") {
    throw new Error(`FACILITATOR_MODE must be on_chain or mock (got: ${raw})`);
  }
  return raw;
}

function parse(): ParsedEnv {
  for (const name of REQUIRED_VARS) {
    if (process.env[name] === undefined || process.env[name] === "") {
      throw new Error(`missing required env var: ${name}`);
    }
  }
  return {
    mode: readMode(),
    port: readInt("PORT", 4021),
    corsOrigins: (process.env.CORS_ORIGIN ?? "*").split(",").map((s) => s.trim()).filter(Boolean),
    stellarRpcUrl: readString("STELLAR_RPC_URL"),
    stellarHorizonUrl: readString("STELLAR_HORIZON_URL"),
    stellarNetworkPassphrase: readString("STELLAR_NETWORK_PASSPHRASE"),
    poolContractId: readString("POOL_CONTRACT_ID"),
    usdcContractId: readString("USDC_CONTRACT_ID"),
    keyPath: resolvePathFromRepoRoot(readString("FACILITATOR_KEY_PATH")),
    minXlmStroops: readBigint("FACILITATOR_MIN_XLM_STROOPS", 50_000_000n),
    maxTransactionFeeStroops: readInt("FACILITATOR_MAX_TX_FEE_STROOPS", 10_000_000),
    cacheHydrateLedgers: readInt("FACILITATOR_HYDRATE_LEDGERS", 119_000),
    circuitVkeyPath: resolvePathFromRepoRoot(readString("FACILITATOR_VKEY_PATH", "wallets/circuits/transact2.vkey.json")),
    logLevel: readString("LOG_LEVEL", "info"),
    settlementsPath: resolvePathFromRepoRoot(readString("FACILITATOR_SETTLEMENTS_PATH", "./data/settlements.jsonl")),
  };
}

export class Env {
  private static cached?: ParsedEnv;

  static validate(): { ok: true } {
    Env.cached = parse();
    return { ok: true };
  }

  static reset(): void {
    Env.cached = undefined;
  }

  private static get state(): ParsedEnv {
    if (!Env.cached) Env.cached = parse();
    return Env.cached;
  }

  static get facilitatorMode(): FacilitatorMode { return Env.state.mode; }
  static get port(): number { return Env.state.port; }
  static get corsOrigins(): string[] { return Env.state.corsOrigins; }
  static get stellarRpcUrl(): string { return Env.state.stellarRpcUrl; }
  static get stellarHorizonUrl(): string { return Env.state.stellarHorizonUrl; }
  static get stellarNetworkPassphrase(): string { return Env.state.stellarNetworkPassphrase; }
  static get poolContractId(): string { return Env.state.poolContractId; }
  static get usdcContractId(): string { return Env.state.usdcContractId; }
  static get keyPath(): string { return Env.state.keyPath; }
  static get minXlmStroops(): bigint { return Env.state.minXlmStroops; }
  static get maxTransactionFeeStroops(): number { return Env.state.maxTransactionFeeStroops; }
  static get cacheHydrateLedgers(): number { return Env.state.cacheHydrateLedgers; }
  static get circuitVkeyPath(): string { return Env.state.circuitVkeyPath; }
  static get logLevel(): string { return Env.state.logLevel; }
  static get settlementsPath(): string { return Env.state.settlementsPath; }
}
