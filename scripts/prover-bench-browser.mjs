#!/usr/bin/env node
// scripts/prover-bench-browser.mjs — SETUP-06 Playwright prover benchmark (fallback).
//
// Fallback when scripts/prover-bench.mjs exits 2 (Node WASM import failed).
// Boots a headless Chromium via Playwright, loads app/index.html (served from
// a trunk-built dist/), invokes the existing prove() pipeline via page.evaluate,
// scrapes wall-clock + proof bytes, and reports a JSON summary identical in
// shape to prover-bench.mjs (just with runtime: "playwright-chromium").
//
// Usage:
//   node scripts/prover-bench-browser.mjs
//   node scripts/prover-bench-browser.mjs --fixture=scripts/bench-fixtures/witness-1real-1null.json
//
// Prerequisites:
//   - app/node_modules/@playwright/test OR app/node_modules/playwright installed
//     (upstream app/ does NOT pre-install Playwright — last-resort fallback is
//      `cd app && npm install --no-save @playwright/test` before running).
//   - `trunk build` produces a working dist/ (runs automatically).
//
// Exit codes:
//   0 — prover ran successfully in browser; JSON result emitted to stdout
//   1 — hard error (trunk missing, playwright missing, dist/ empty, etc.)
//   2 — prover page-evaluate error (the browser context could not run prove())
//
// STATUS AS OF PLAN 00-05 RUN (2026-04-11):
//   Task 1 (scripts/prover-bench.mjs) exited 0 with Node-WASM path winning
//   at 2.75s wall-clock. This fallback script was written but NOT executed.
//   It remains in-tree as insurance for future regressions of the Node-WASM
//   path (e.g. Node version drift, wasmer-js breaking changes, getrandom-js
//   regression). If Node-WASM ever regresses, re-run this via:
//     (cd app && npm install --no-save @playwright/test)
//     node scripts/prover-bench-browser.mjs --fixture=scripts/bench-fixtures/witness-1real-1null.json
//
// POOL-08 H1/H2/H3/H4 hypothesis detection mirrors scripts/prover-bench.mjs:
//   H1 — real and null public keys are identical (depositor-key reuse)
//   H2 — null public key is all-zero (Poseidon2(0, 0) preseed)
//   H3 — unexpected shape (halt Phase 1)
//   H4 — distinct caller-managed keys per slot (BOTH inserted)

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, "..");

function die(msg) {
  console.error(`prover-bench-browser: FAIL — ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.error(`prover-bench-browser: ${msg}`);
}

// ---------------------------------------------------------------------------
// Step A: check for playwright under app/node_modules (upstream-installed or
// `npm install --no-save @playwright/test` after Task 1 fall-through).
// ---------------------------------------------------------------------------
const PLAYWRIGHT_CORE = path.join(ROOT, "app", "node_modules", "playwright-core", "package.json");
const PLAYWRIGHT_PKG  = path.join(ROOT, "app", "node_modules", "playwright",      "package.json");
const PLAYWRIGHT_TEST = path.join(ROOT, "app", "node_modules", "@playwright", "test", "package.json");

if (!existsSync(PLAYWRIGHT_CORE) && !existsSync(PLAYWRIGHT_PKG) && !existsSync(PLAYWRIGHT_TEST)) {
  die(
    `playwright not found under app/node_modules (tried playwright-core, playwright, @playwright/test)\n` +
    `  install via:\n` +
    `    (cd app && npm install --no-save @playwright/test)\n` +
    `  then re-run this script`
  );
}

// ---------------------------------------------------------------------------
// Step B: run `trunk build` to populate dist/.
// ---------------------------------------------------------------------------
info("running `trunk build`");
const trunkRc = await new Promise((resolve) => {
  const p = spawn("trunk", ["build"], { cwd: ROOT, stdio: "inherit" });
  p.on("exit", (code) => resolve(code ?? 1));
  p.on("error", () => resolve(1));
});
if (trunkRc !== 0) {
  die(`trunk build exited ${trunkRc}`);
}

const DIST  = path.join(ROOT, "dist");
const INDEX = path.join(DIST, "index.html");
if (!existsSync(INDEX)) {
  die(`trunk build succeeded but ${INDEX} missing`);
}

// ---------------------------------------------------------------------------
// Step C: start a minimal static server over dist/ on a random port. The
// COOP/COEP headers are set because the prover's SharedArrayBuffer path
// requires cross-origin isolation in browsers.
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".css":  "text/css",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".bin":  "application/octet-stream",
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = (req.url || "/").split("?")[0];
    const safePath = path.normalize(urlPath).replace(/^(\.\.[\\/])+/, "");
    const filePath = path.join(DIST, safePath === "/" ? "index.html" : safePath);
    const rel = path.relative(DIST, filePath);
    if (rel.startsWith("..")) {
      res.writeHead(403); res.end("forbidden"); return;
    }
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-embedder-policy": "require-corp",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(404); res.end(String(e?.message ?? e));
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const PORT = server.address().port;
const BASE_URL = `http://127.0.0.1:${PORT}`;
info(`static server listening at ${BASE_URL}`);

// ---------------------------------------------------------------------------
// Step D: import Playwright from the upstream install and boot headless Chromium.
// ---------------------------------------------------------------------------
let playwrightMod;
try {
  playwrightMod = await import(path.join(ROOT, "app", "node_modules", "playwright-core", "index.mjs"));
} catch {
  try {
    playwrightMod = await import(path.join(ROOT, "app", "node_modules", "playwright", "index.mjs"));
  } catch {
    die("could not import playwright from app/node_modules");
  }
}

const { chromium } = playwrightMod;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console",  (msg) => info(`[browser ${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => info(`[browser pageerror] ${err.message}`));

info(`navigating to ${BASE_URL}/index.html`);
await page.goto(`${BASE_URL}/index.html`, { waitUntil: "networkidle" });

// ---------------------------------------------------------------------------
// Step E: wait until the prover module is loaded and a global entry is available.
// The browser app loads ./js/prover-client.js (bundled via esbuild). It exports
// `prove(inputs, options)` which spawns a worker and returns a Uint8Array proof.
// We inject a thin window-level shim so page.evaluate can call it.
// ---------------------------------------------------------------------------
await page.evaluate(async () => {
  if (!window.__enclaveBenchReady) {
    try {
      const mod = await import("./js/prover-client.js");
      window.__enclaveProve = mod.prove || mod.default?.prove;
      window.__enclaveBenchReady = true;
    } catch (e) {
      window.__enclaveBenchError = String(e?.message ?? e);
    }
  }
});

const benchErr = await page.evaluate(() => window.__enclaveBenchError);
if (benchErr) {
  await browser.close();
  server.close();
  console.error(`prover-bench-browser: could not wire prove() in browser: ${benchErr}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Step F: load the fixture and invoke prove() inside the browser context.
// The non-circuit keys (_pool08_evidence, inPublicKey) are stripped before
// passing inputs to prove() — same guard as scripts/prover-bench.mjs.
// ---------------------------------------------------------------------------
const fixtureArg = process.argv.find((a) => a.startsWith("--fixture="));
const fixturePath = fixtureArg
  ? fixtureArg.slice("--fixture=".length)
  : path.join(ROOT, "scripts", "bench-fixtures", "witness-1real-1null.json");
const fixtureRaw = JSON.parse(await readFile(fixturePath, "utf8"));
const {
  _pool08_evidence: pool08Evidence,
  inPublicKey: inPublicKeyObserved,
  ...fixtureInputs
} = fixtureRaw;

info("invoking prove() in browser");
const t0 = performance.now();
const browserResult = await page.evaluate(async (inputs) => {
  if (!window.__enclaveProve) throw new Error("prove() not wired");
  const start = performance.now();
  const result = await window.__enclaveProve(inputs);
  const elapsed = performance.now() - start;
  const proof = result?.proof ?? result;
  let bytesLen = 0;
  let bytesHex = "";
  if (proof instanceof Uint8Array) {
    bytesLen = proof.length;
    bytesHex = Array.from(proof).map((b) => b.toString(16).padStart(2, "0")).join("");
  } else if (proof && typeof proof === "object") {
    bytesHex = JSON.stringify(proof);
    bytesLen = bytesHex.length;
  }
  return { elapsed, bytesLen, bytesHex };
}, fixtureInputs);
const totalMs = performance.now() - t0;
info(`prove() returned in ${browserResult.elapsed.toFixed(0)}ms (round-trip ${totalMs.toFixed(0)}ms)`);

await browser.close();
server.close();

const sha256 = createHash("sha256").update(browserResult.bytesHex).digest("hex");

// ---------------------------------------------------------------------------
// Step G: POOL-08 hypothesis cross-check (same classifier as prover-bench.mjs).
// ---------------------------------------------------------------------------
const real  = inPublicKeyObserved?.[0] ?? null;
const nullK = inPublicKeyObserved?.[1] ?? null;
let hypothesis = "H3-unexpected";
if (real != null && nullK != null) {
  if (String(real) === String(nullK))                                     hypothesis = "H1-reuses-depositor-key";
  else if (String(nullK) === "0" || /^0+$/.test(String(nullK)))           hypothesis = "H2-field-zero";
  else                                                                     hypothesis = "H4-distinct-caller-keys";
}

const result = {
  runtime: "playwright-chromium",
  status: "pass",
  wallClockMs: Math.round(browserResult.elapsed),
  roundTripMs: Math.round(totalMs),
  peakRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  pool08: {
    observed_real_pubkey: real,
    observed_null_pubkey: nullK,
    hypothesis,
  },
  proof: { bytesLen: browserResult.bytesLen, sha256 },
};
console.log(JSON.stringify(result));
process.exit(0);
