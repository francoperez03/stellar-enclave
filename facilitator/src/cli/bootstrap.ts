#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { resolveRepoRoot } from "../config/paths.js";

export interface BootstrapOptions {
  keyPath?: string;
  force?: boolean;
  fetchFn?: typeof fetch;
  horizonUrl?: string;
  repoRoot?: string;
}

export interface BootstrapResult {
  publicKey: string;
  keyPath: string;
  created: boolean;
  xlmBalance: string | null;
  usdcFundingInstructions?: string;
}

const DEFAULT_KEY_PATH = "wallets/facilitator/admin.key";
const DEFAULT_FRIENDBOT = "https://friendbot.stellar.org";
const DEFAULT_HORIZON = "https://horizon-testnet.stellar.org";

function ensureInsideRepo(repoRoot: string, target: string): void {
  const resolved = resolve(target);
  const resolvedRoot = resolve(repoRoot);
  if (!resolved.startsWith(resolvedRoot + "/") && resolved !== resolvedRoot) {
    throw new Error(`refusing to write key outside repo: ${resolved}`);
  }
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const repoRoot = options.repoRoot ?? resolveRepoRoot(process.cwd());
  const keyPath = options.keyPath
    ? resolve(options.keyPath) // absolute path — check it's inside repo
    : resolve(repoRoot, DEFAULT_KEY_PATH);

  ensureInsideRepo(repoRoot, keyPath);

  let keypair: Keypair;
  let created = false;

  if (existsSync(keyPath) && !options.force) {
    const existingSeed = readFileSync(keyPath);
    if (existingSeed.length !== 32) {
      throw new Error(`existing key at ${keyPath} is not 32 bytes (got ${existingSeed.length})`);
    }
    keypair = Keypair.fromRawEd25519Seed(existingSeed);
    console.log(`[bootstrap] key already exists at ${keyPath}, reusing`);
  } else {
    mkdirSync(dirname(keyPath), { recursive: true });
    const seed = randomBytes(32);
    writeFileSync(keyPath, seed, { mode: 0o600 });
    keypair = Keypair.fromRawEd25519Seed(seed);
    created = true;
    console.log(`[bootstrap] created new facilitator key at ${keyPath}`);
  }

  console.log(`[bootstrap] public key: ${keypair.publicKey()}`);

  // Fund via friendbot
  const fetchFn = options.fetchFn ?? fetch;
  try {
    const url = `${DEFAULT_FRIENDBOT}/?addr=${keypair.publicKey()}`;
    const res = await fetchFn(url);
    if (!res.ok && res.status !== 400) {
      // 400 from friendbot typically means "already funded" — that's fine.
      throw new Error(`friendbot ${res.status}: ${await res.text()}`);
    }
    console.log(`[bootstrap] friendbot funded ${keypair.publicKey()} (status ${res.status})`);
  } catch (err) {
    console.warn(`[bootstrap] friendbot call failed: ${(err as Error).message}`);
  }

  // Read XLM balance
  let xlmBalance: string | null = null;
  try {
    const horizonUrl = options.horizonUrl ?? DEFAULT_HORIZON;
    const accountRes = await fetchFn(`${horizonUrl}/accounts/${keypair.publicKey()}`);
    if (accountRes.ok) {
      const account = (await accountRes.json()) as { balances: Array<{ asset_type: string; balance: string }> };
      const native = account.balances.find((b) => b.asset_type === "native");
      xlmBalance = native?.balance ?? null;
      console.log(`[bootstrap] XLM balance: ${xlmBalance ?? "unknown"}`);
    }
  } catch (err) {
    console.warn(`[bootstrap] horizon balance read failed: ${(err as Error).message}`);
  }

  // USDC funding is manual — print instructions
  const usdcFundingInstructions = [
    "",
    "[bootstrap] USDC funding is MANUAL for Phase 2:",
    `  1. Transfer ≥30 USDC to ${keypair.publicKey()} via your testnet SAC faucet or`,
    "     by running: pnpm --filter @enclave/treasury run fund-usdc",
    "  2. Re-run bootstrap to verify balances.",
    "",
  ].join("\n");
  console.log(usdcFundingInstructions);

  return {
    publicKey: keypair.publicKey(),
    keyPath,
    created,
    xlmBalance,
    usdcFundingInstructions,
  };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes("--force");
  bootstrap({ force }).catch((err) => {
    console.error("bootstrap failed:", err);
    process.exit(1);
  });
}
