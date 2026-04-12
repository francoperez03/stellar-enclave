/**
 * Env surface for the Enclave gate middleware. One source of truth for every
 * environment variable read by Phase 4. Parsing and validation happen once
 * via `Env.validate()` at boot; all subsequent reads are synchronous and typed.
 *
 * Mirrors the pattern in facilitator/src/config/env.ts.
 */

interface ParsedEnv {
  facilitatorUrl: string;
  orgId: string;
  port: number;
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

function parse(): ParsedEnv {
  return {
    facilitatorUrl: readString("FACILITATOR_URL"),
    orgId: readString("GATE_ORG_ID", "northfield-capital"),
    port: readInt("GATE_PORT", 4030),
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
  static get orgId(): string { return Env.state.orgId; }
  static get port(): number { return Env.state.port; }
}
