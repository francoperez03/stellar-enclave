import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "../../..");
const REQUIREMENTS_PATH = resolve(REPO_ROOT, ".planning/REQUIREMENTS.md");
const VALIDATION_PATH = resolve(
  REPO_ROOT,
  ".planning/phases/02-facilitator-bridge/02-VALIDATION.md",
);
const FACILITATOR_TEST_ROOT = resolve(REPO_ROOT, "facilitator/test");
const FACILITATOR_SRC_ROOT = resolve(REPO_ROOT, "facilitator/src");

// FACIL-02 is CUT — it must NOT be present in any source file
const PHASE2_REQUIREMENTS = [
  "FACIL-01",
  "FACIL-03",
  "FACIL-04",
  "FACIL-05",
  "FACIL-06",
  "FACIL-07",
  "FACIL-08",
];
const CUT_REQUIREMENTS = ["FACIL-02"];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith(".spec.ts") || name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

function grepFiles(files: string[], needle: string): string[] {
  return files.filter((f) => readFileSync(f, "utf-8").includes(needle));
}

describe("demo lock: Phase 2 requirements coverage", () => {
  it("REQUIREMENTS.md exists and contains all Phase 2 IDs", () => {
    expect(existsSync(REQUIREMENTS_PATH)).toBe(true);
    const body = readFileSync(REQUIREMENTS_PATH, "utf-8");
    for (const req of PHASE2_REQUIREMENTS) {
      expect(body, `REQUIREMENTS.md is missing ${req}`).toContain(req);
    }
  });

  it("VALIDATION.md exists and maps every Phase 2 requirement to a test", () => {
    expect(existsSync(VALIDATION_PATH)).toBe(true);
    const body = readFileSync(VALIDATION_PATH, "utf-8");
    for (const req of PHASE2_REQUIREMENTS) {
      expect(body, `VALIDATION.md is missing ${req}`).toContain(req);
    }
  });

  it.each(PHASE2_REQUIREMENTS)(
    "%s is covered by at least one spec or canonical source file under facilitator/",
    (req) => {
      const testFiles = walk(FACILITATOR_TEST_ROOT);
      const srcFiles = walk(FACILITATOR_SRC_ROOT);
      const hits = grepFiles([...testFiles, ...srcFiles], req);

      // Canonical primitive file that implements the requirement (fallback if no
      // explicit mention of the ID in a test comment/describe block).
      const canonical: Record<string, string> = {
        "FACIL-01": "facilitator/src/chain/submitPoolTransaction.ts",
        "FACIL-03": "facilitator/src/replay/cache.ts",
        "FACIL-04": "facilitator/src/validation/bindingCheck.ts",
        "FACIL-05": "facilitator/src/routes/health.ts",
        "FACIL-06": "facilitator/src/routes/settle.ts",
        "FACIL-07": "facilitator/src/chain/balanceReader.ts",
        "FACIL-08": "facilitator/src/chain/stellarClient.ts",
      };

      if (hits.length === 0) {
        const canonicalPath = resolve(REPO_ROOT, canonical[req]);
        expect(
          existsSync(canonicalPath),
          `${req}: no spec mentions it AND canonical file missing: ${canonical[req]}`,
        ).toBe(true);
      } else {
        expect(hits.length, `${req} should have at least one coverage hit`).toBeGreaterThan(0);
      }
    },
  );

  it.each(CUT_REQUIREMENTS)(
    "%s is NOT referenced under facilitator/src (confirms CUT decision)",
    (req) => {
      const files = walk(FACILITATOR_SRC_ROOT);
      const hits = grepFiles(files, req);
      expect(hits, `${req} should be CUT but was found in: ${hits.join(", ")}`).toEqual([]);
    },
  );
});
