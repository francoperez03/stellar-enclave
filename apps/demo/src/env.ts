/**
 * Env surface for the Enclave demo app. One source of truth for every
 * environment variable read by Phase 4. Parsing and validation happen once
 * via `Env.validate()` at boot; all subsequent reads are synchronous and typed.
 *
 * Required: FACILITATOR_URL
 * Optional: DEMO_PORT (default 4030), GATE_ORG_ID (default "northfield-capital"),
 *           USDC_CONTRACT_ID, LOG_LEVEL (default "info"),
 *           GATE_ALLOWED_AUTH_KEYS ("key1:org1,key2:org2" format)
 */

interface ParsedEnv {
  facilitatorUrl: string;
  port: number;
  gateOrgId: string;
  usdcContractId: string;
  allowedAuthKeys: Map<string, string>;
  logLevel: string;
}

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

function parseAuthKeys(): Map<string, string> {
  const raw = process.env.GATE_ALLOWED_AUTH_KEYS ?? "";
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const [key, org] = pair.split(":");
    if (key && org) map.set(key.trim(), org.trim());
  }
  return map;
}

function parse(): ParsedEnv {
  return {
    facilitatorUrl: readString("FACILITATOR_URL"),
    port: readInt("DEMO_PORT", 4030),
    gateOrgId: readString("GATE_ORG_ID", "northfield-capital"),
    usdcContractId: readString(
      "USDC_CONTRACT_ID",
      "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
    ),
    allowedAuthKeys: parseAuthKeys(),
    logLevel: readString("LOG_LEVEL", "info"),
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

  static get facilitatorUrl(): string { return Env.state.facilitatorUrl; }
  static get port(): number { return Env.state.port; }
  static get gateOrgId(): string { return Env.state.gateOrgId; }
  static get usdcContractId(): string { return Env.state.usdcContractId; }
  static get allowedAuthKeys(): Map<string, string> { return Env.state.allowedAuthKeys; }
  static get logLevel(): string { return Env.state.logLevel; }
}
