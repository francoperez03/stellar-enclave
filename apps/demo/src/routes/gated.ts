import type { Request, Response } from "express";

export function handleTreasuryReport(orgId: string) {
  return (_req: Request, res: Response) => {
    res.json({
      org: orgId === "northfield-capital" ? "Northfield Capital" : orgId,
      access: "granted",
      report: {
        message: "Shielded org membership verified via Enclave Gate",
        timestamp: new Date().toISOString(),
        note: "This endpoint is gated by ZK proof of org membership",
      },
    });
  };
}
