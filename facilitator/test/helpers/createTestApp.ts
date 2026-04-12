import express, { type Express } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pino, { type Logger } from "pino";
import type { MockChainClient } from "./mockChainClient.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, "..", "fixtures");

export interface TestAppOptions {
  chainClient?: MockChainClient;
}

/**
 * Wave 0 placeholder: returns a minimal Express app with /health.
 * Plan 07 replaces the body with the real createApp() wired to routes.
 * This helper's SIGNATURE is stable — plans 04/05/07 use it verbatim.
 */
export function createTestApp(_options: TestAppOptions = {}): Express {
  const app = express();
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", phase: "wave-0-scaffold" });
  });
  return app;
}

/**
 * Returns a silent pino logger suitable for unit/integration tests.
 */
export function makeMockLogger(): Logger {
  return pino({ level: "silent" });
}

/**
 * Load the raw JSON from the shielded-proof fixture (wire format — strings).
 */
export function loadProofFixture(): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, "shielded-proof.json"), "utf8"));
}

/**
 * Load the raw JSON from the ext-data fixture (wire format — string ext_amount).
 */
export function loadExtDataFixture(): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, "ext-data.json"), "utf8"));
}

/**
 * Load the raw JSON from payment-requirements fixture.
 */
export function loadRequirementsFixture(): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, "payment-requirements.json"), "utf8"));
}
