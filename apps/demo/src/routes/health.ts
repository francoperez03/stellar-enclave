import type { Request, Response } from "express";

export function handleHealth(gateOrgId: string, facilitatorUrl: string) {
  return (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      gateOrgId,
      facilitatorUrl,
      uptime: process.uptime(),
    });
  };
}
