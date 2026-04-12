import { vi } from "vitest";

export interface MockChainClient {
  submitPoolTransaction: ReturnType<typeof vi.fn>;
  simulatePoolTransaction: ReturnType<typeof vi.fn>;
  hydrateNullifierCache: ReturnType<typeof vi.fn>;
  getPoolUsdcBalance: ReturnType<typeof vi.fn>;
  getFacilitatorXlmBalance: ReturnType<typeof vi.fn>;
  getLatestPoolRoot: ReturnType<typeof vi.fn>;
}

export function createMockChainClient(overrides: Partial<MockChainClient> = {}): MockChainClient {
  return {
    submitPoolTransaction: vi.fn(async () => ({ txHash: "mock:abc123", ledger: 12345, feePaidStroops: "100000" })),
    simulatePoolTransaction: vi.fn(async () => ({ isValid: true })),
    hydrateNullifierCache: vi.fn(async () => {}),
    getPoolUsdcBalance: vi.fn(async () => 100_000_000n),
    getFacilitatorXlmBalance: vi.fn(async () => 100_000_000_000n),
    getLatestPoolRoot: vi.fn(async () => "0xdeadbeef"),
    ...overrides,
  };
}
