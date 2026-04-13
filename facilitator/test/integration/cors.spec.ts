import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createInitialState } from "../../src/state.js";
import { NullifierCache } from "../../src/replay/cache.js";
import { createSettlementsLog } from "../../src/settlements/log.js";
import pino from "pino";
import os from "node:os";
import path from "node:path";

function makeState() {
  return createInitialState({
    mode: "mock",
    cache: new NullifierCache(),
    client: null,
    vKey: {},
    logger: pino({ level: "silent" }),
    settlementsLog: createSettlementsLog({
      path: path.join(os.tmpdir(), `cors-test-${Date.now()}.jsonl`),
    }),
  });
}

describe("CORS", () => {
  it('returns Access-Control-Allow-Origin: * when corsOrigins = ["*"]', async () => {
    const app = createApp(makeState(), { corsOrigins: ["*"] });
    const res = await request(app)
      .get("/settlements")
      .set("Origin", "http://localhost:8080");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it('returns Access-Control-Allow-Origin: * when corsOrigins is undefined', async () => {
    const app = createApp(makeState());
    const res = await request(app)
      .get("/settlements")
      .set("Origin", "http://example.com");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("echoes matching origin when a specific allowlist is configured", async () => {
    const app = createApp(makeState(), {
      corsOrigins: ["http://localhost:8080", "http://localhost:3000"],
    });
    const res = await request(app)
      .get("/settlements")
      .set("Origin", "http://localhost:8080");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8080");
  });
});
