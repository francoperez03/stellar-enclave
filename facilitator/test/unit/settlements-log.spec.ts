import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSettlementsLog } from "../../src/settlements/log.js";

function makeTmpPath(): string {
  return path.join(
    os.tmpdir(),
    `settlements-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`,
  );
}

describe("SettlementsLog", () => {
  let tmpPath: string;

  beforeEach(() => {
    tmpPath = makeTmpPath();
  });

  afterEach(async () => {
    await fs.rm(tmpPath, { force: true });
  });

  it("list() on missing file returns []", async () => {
    const log = createSettlementsLog({ path: tmpPath });
    await expect(log.list()).resolves.toEqual([]);
  });

  it("append then list returns one entry", async () => {
    const log = createSettlementsLog({ path: tmpPath });
    const entry = { ts: 1, nullifier: "12345", recipient: "GABC", amount: "-10", txHash: "tx1" };
    await log.append(entry);
    const entries = await log.list();
    expect(entries).toEqual([entry]);
  });

  it("multiple appends preserve insertion order", async () => {
    const log = createSettlementsLog({ path: tmpPath });
    const e1 = { ts: 1, nullifier: "n1", recipient: "G1", amount: "-10", txHash: "tx1" };
    const e2 = { ts: 2, nullifier: "n2", recipient: "G2", amount: "-20", txHash: "tx2" };
    const e3 = { ts: 3, nullifier: "n3", recipient: "G3", amount: "-30", txHash: "tx3" };
    await log.append(e1);
    await log.append(e2);
    await log.append(e3);
    const entries = await log.list();
    expect(entries).toEqual([e1, e2, e3]);
  });

  it("corrupt trailing line is skipped", async () => {
    const log = createSettlementsLog({ path: tmpPath });
    const validEntry = { ts: 100, nullifier: "abc", recipient: "GVALID", amount: "-5", txHash: "txvalid" };
    await log.append(validEntry);
    // Append a corrupt/partial JSON line directly
    await fs.appendFile(tmpPath, "{not valid json", "utf8");
    const entries = await log.list();
    expect(entries).toEqual([validEntry]);
  });

  it("nullifier string is stored verbatim", async () => {
    const log = createSettlementsLog({ path: tmpPath });
    const verbatimNullifier = "11358804175784011556983566069223353458886112955603727705581586970645942642628";
    await log.append({
      ts: 999,
      nullifier: verbatimNullifier,
      recipient: "GTEST",
      amount: "-100",
      txHash: "txverbatim",
    });
    const entries = await log.list();
    expect(entries[0].nullifier).toBe(verbatimNullifier);
  });
});
