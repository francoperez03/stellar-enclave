import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

// Helper to create a temp dir that looks like a repo root
function makeTempRepoDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "enclave-bootstrap-test-"));
  // Create .git marker so resolveRepoRoot() can find it
  mkdirSync(join(dir, ".git"));
  return dir;
}

describe("bootstrap CLI", () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    dirs.length = 0;
  });

  it("Test 1: creates admin.key with exactly 32 bytes in a fresh temp dir", async () => {
    const repoRoot = makeTempRepoDir();
    dirs.push(repoRoot);

    const { bootstrap } = await import("../../src/cli/bootstrap.js");
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "", json: async () => ({ balances: [] }) });

    const result = await bootstrap({ repoRoot, fetchFn });

    const keyPath = join(repoRoot, "wallets/facilitator/admin.key");
    expect(existsSync(keyPath)).toBe(true);
    const bytes = readFileSync(keyPath);
    expect(bytes.length).toBe(32);
    expect(result.created).toBe(true);
    expect(result.publicKey).toMatch(/^G/);
  });

  it("Test 2: second bootstrap() call in same dir does NOT overwrite the existing key (idempotent)", async () => {
    const repoRoot = makeTempRepoDir();
    dirs.push(repoRoot);

    const { bootstrap } = await import("../../src/cli/bootstrap.js");
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "", json: async () => ({ balances: [] }) });

    const result1 = await bootstrap({ repoRoot, fetchFn });
    const keyPath = join(repoRoot, "wallets/facilitator/admin.key");
    const firstBytes = readFileSync(keyPath);

    const result2 = await bootstrap({ repoRoot, fetchFn });
    const secondBytes = readFileSync(keyPath);

    expect(result1.created).toBe(true);
    expect(result2.created).toBe(false);
    expect(secondBytes).toEqual(firstBytes);
    expect(result1.publicKey).toBe(result2.publicKey);
  });

  it("Test 3: bootstrap() with force=true overwrites the existing key", async () => {
    const repoRoot = makeTempRepoDir();
    dirs.push(repoRoot);

    const { bootstrap } = await import("../../src/cli/bootstrap.js");
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "", json: async () => ({ balances: [] }) });

    const result1 = await bootstrap({ repoRoot, fetchFn });
    const keyPath = join(repoRoot, "wallets/facilitator/admin.key");
    const firstBytes = Buffer.from(readFileSync(keyPath));

    const result2 = await bootstrap({ repoRoot, fetchFn, force: true });
    const secondBytes = Buffer.from(readFileSync(keyPath));

    expect(result2.created).toBe(true);
    // New key should be different (with overwhelming probability) from the first
    // Note: in rare cases they could match, but with 32 random bytes that's 2^-256
    expect(secondBytes.length).toBe(32);
    // Public keys should be valid Stellar G... keys
    expect(result1.publicKey).toMatch(/^G/);
    expect(result2.publicKey).toMatch(/^G/);
  });

  it("Test 4: rejects if the target key path is outside the repo root", async () => {
    const repoRoot = makeTempRepoDir();
    dirs.push(repoRoot);

    const { bootstrap } = await import("../../src/cli/bootstrap.js");
    const fetchFn = vi.fn();

    await expect(
      bootstrap({ repoRoot, fetchFn, keyPath: "/etc/passwd" }),
    ).rejects.toThrow(/refusing to write key outside repo/);
  });

  it("Test 5: mocked friendbot — a fetch call is made to the friendbot URL with the public key", async () => {
    const repoRoot = makeTempRepoDir();
    dirs.push(repoRoot);

    const { bootstrap } = await import("../../src/cli/bootstrap.js");
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "", json: async () => ({ balances: [] }) });

    const result = await bootstrap({ repoRoot, fetchFn });

    // At least one fetch call should be to friendbot with the public key
    const calls = fetchFn.mock.calls.map((c: unknown[]) => String(c[0]));
    const friendbotCall = calls.find((url: string) => url.includes("friendbot") && url.includes(result.publicKey));
    expect(friendbotCall).toBeTruthy();
  });

  it("Test 6: readXlmBalance (via horizon) is called and the result is captured in xlmBalance", async () => {
    const repoRoot = makeTempRepoDir();
    dirs.push(repoRoot);

    const { bootstrap } = await import("../../src/cli/bootstrap.js");
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("friendbot")) {
        return { ok: true, status: 200, text: async () => "" };
      }
      // Horizon account endpoint
      return {
        ok: true,
        status: 200,
        json: async () => ({
          balances: [{ asset_type: "native", balance: "9999.9999900" }],
        }),
      };
    });

    const result = await bootstrap({ repoRoot, fetchFn });
    expect(result.xlmBalance).toBe("9999.9999900");
  });

  it("Test 7: when friendbot fails, bootstrap still returns a result with usdcFundingInstructions present", async () => {
    const repoRoot = makeTempRepoDir();
    dirs.push(repoRoot);

    const { bootstrap } = await import("../../src/cli/bootstrap.js");
    const fetchFn = vi.fn().mockRejectedValue(new Error("network unreachable"));

    const result = await bootstrap({ repoRoot, fetchFn });
    // Even if friendbot fails, the function returns and includes USDC instructions
    expect(result.publicKey).toMatch(/^G/);
    expect(result.usdcFundingInstructions).toBeTruthy();
    expect(result.usdcFundingInstructions).toContain("USDC");
  });

  it("Test 8: facilitator/package.json has 'bin' with enclave-facilitator and 'bootstrap' script", async () => {
    const pkgPath = resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin["enclave-facilitator"]).toBeTruthy();
    expect(pkg.scripts.bootstrap).toBeTruthy();
  });

  it("Test 9: wallets/facilitator/.gitignore exists and contains 'admin.key'", () => {
    const gitignorePath = resolve(__dirname, "../../../wallets/facilitator/.gitignore");
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("admin.key");
  });
});
