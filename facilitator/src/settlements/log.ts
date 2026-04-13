import { promises as fs } from "node:fs";
import path from "node:path";

export interface SettlementEntry {
  ts: number;        // Date.now() — integer ms since epoch
  nullifier: string; // decimal bigint string — verbatim from ShieldedProofWireFormat.inputNullifiers[0]
  recipient: string; // Stellar G... strkey from ExtDataWireFormat.recipient
  amount: string;    // decimal string from ExtDataWireFormat.ext_amount (may be negative for withdrawals)
  txHash: string;    // Soroban tx hash (on_chain mode) or mockTxHash (mock mode)
}

export interface SettlementsLog {
  append(entry: SettlementEntry): Promise<void>;
  list(): Promise<SettlementEntry[]>;
}

export function createSettlementsLog(opts: { path: string }): SettlementsLog {
  return {
    async append(entry: SettlementEntry): Promise<void> {
      await fs.mkdir(path.dirname(opts.path), { recursive: true });
      await fs.appendFile(opts.path, JSON.stringify(entry) + "\n", "utf8");
    },

    async list(): Promise<SettlementEntry[]> {
      let raw: string;
      try {
        raw = await fs.readFile(opts.path, "utf8");
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw err;
      }

      const lines = raw.split("\n");
      const entries: SettlementEntry[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed) as SettlementEntry);
        } catch {
          // Skip corrupt/partial lines (e.g. crash mid-write)
        }
      }
      return entries;
    },
  };
}
