import { test, expect } from "@playwright/test";

// DEMO-06: video narration & landing copy must NOT claim per-org on-chain ASPs, mainnet readiness, or security audit status.
// SETUP-07: narrative lock — "shared ASP, per-org policy off-chain". Any inverse phrasing is a regression.
// Memory feedback: never use OrgVault/GuildGate/s402 codenames or Acme/Globex/Initech demo org names.

const FORBIDDEN_PHRASES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /mainnet[-\s]ready/i, reason: "DEMO-06 — no mainnet readiness claims" },
  { pattern: /mainnet[-\s]compatible/i, reason: "DEMO-06 — no mainnet compatibility claims" },
  { pattern: /security[-\s]audit(ed)?/i, reason: "DEMO-06 — no security audit claims" },
  { pattern: /per[-\s]org\s+on[-\s]chain\s+ASP/i, reason: "SETUP-07 — narrative lock: shared ASP, per-org policy off-chain" },
  { pattern: /per[-\s]org\s+anonymity\s+set/i, reason: "SETUP-07 — no per-org anonymity-set claims" },
  { pattern: /\bOrgVault\b/, reason: "Legacy codename — use Enclave" },
  { pattern: /\bGuildGate\b/, reason: "Legacy codename — use Enclave Gate" },
  { pattern: /\bs402\b/, reason: "Legacy codename — use Enclave" },
  { pattern: /\bAcme\b/, reason: "Demo orgs must be Northfield Capital/Ashford Partners/Bayridge Capital" },
  { pattern: /\bGlobex\b/, reason: "Demo orgs must be Northfield Capital/Ashford Partners/Bayridge Capital" },
  { pattern: /\bInitech\b/, reason: "Demo orgs must be Northfield Capital/Ashford Partners/Bayridge Capital" },
];

test.describe("Enclave landing — claim hygiene (DEMO-06 + SETUP-07 + memory feedback)", () => {
  test("page text contains no forbidden phrases", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Grab the full rendered text of <body> — includes all sections and footer.
    const bodyText = await page.locator("body").innerText();

    const violations: string[] = [];
    for (const { pattern, reason } of FORBIDDEN_PHRASES) {
      const match = bodyText.match(pattern);
      if (match) {
        violations.push(`FORBIDDEN: "${match[0]}" — ${reason}`);
      }
    }

    expect(violations, `Claim-hygiene violations found:\n${violations.join("\n")}`).toEqual([]);
  });

  test("SETUP-07 positive: landing asserts the correct architecture phrasing", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const bodyText = await page.locator("body").innerText();

    // At least one of these narrative-lock phrasings MUST appear (positive assertion).
    const positivePatterns = [
      /per[-\s]org\s+policy\s+enforced\s+off[-\s]chain/i,
      /per[-\s]org\s+policy\s+off[-\s]chain/i,
      /shared\s+(shielded\s+)?pool/i,
    ];
    const found = positivePatterns.some((p) => p.test(bodyText));
    expect(found, "SETUP-07: expected at least one of 'per-org policy off-chain' / 'shared shielded pool' phrasings in landing copy").toBeTruthy();
  });
});
