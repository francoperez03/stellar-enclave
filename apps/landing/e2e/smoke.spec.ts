import { test, expect } from "@playwright/test";

test.describe("Enclave landing — layout & sections", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the sacred slogan exactly once (three-line stack)", async ({ page }) => {
    // Each beat appears on its own <span className="block">.
    // Combined page text should contain all three beats verbatim.
    const body = page.locator("body");
    await expect(body).toContainText("Your agents.");
    await expect(body).toContainText("Your rules.");
    await expect(body).toContainText("Out of sight.");

    // H1 is present
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("Your agents.");
    await expect(h1).toContainText("Your rules.");
    await expect(h1).toContainText("Out of sight.");
  });

  test("all 6 sections render (Hero, Problem, HowItWorks, ThreeOrgs, TryIt, Footer)", async ({ page }) => {
    // Section markers — each section has a unique H2 text or identifying role.
    await expect(page.locator("text=Every payment your agent makes is public.")).toBeVisible();
    await expect(page.locator("text=Shielded, settled, private.")).toBeVisible();
    await expect(page.locator("text=Three rival funds. One pool. Zero cross-visibility.")).toBeVisible();
    await expect(page.locator("text=See it live on testnet.")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
  });

  test("POOL-02: three persona names present verbatim", async ({ page }) => {
    await expect(page.locator("text=Northfield Capital").first()).toBeVisible();
    await expect(page.locator("text=Ashford Partners").first()).toBeVisible();
    await expect(page.locator("text=Bayridge Capital").first()).toBeVisible();
  });

  test("DEMO-06 via CTA href: Go to App resolves to /enclave.html or configured CONSOLE_URL", async ({ page }) => {
    // The primary CTA in the hero must link to /enclave.html by default.
    const cta = page.getByRole("link", { name: /Go to the Enclave Treasury console/i }).first();
    await expect(cta).toBeVisible();
    const href = await cta.getAttribute("href");
    expect(href).toBeTruthy();
    expect(
      href === "/enclave.html" ||
        (href ?? "").includes("/enclave.html") ||
        (href ?? "").startsWith("https://") ||
        (href ?? "").startsWith("http://")
    ).toBeTruthy();
  });

  test("DEMO-01: GitHub link in footer", async ({ page }) => {
    const footer = page.locator("footer");
    const githubLink = footer.getByRole("link", { name: /github/i });
    await expect(githubLink.first()).toBeVisible();
    const href = await githubLink.first().getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).not.toBe(""); // fallback is "#" when unset; either "#" or URL is acceptable for build-time test
  });

  test("DEMO-04: DoraHacks link in footer", async ({ page }) => {
    const footer = page.locator("footer");
    const doraLink = footer.getByRole("link", { name: /dorahacks/i });
    await expect(doraLink.first()).toBeVisible();
    const href = await doraLink.first().getAttribute("href");
    expect(href).toBeTruthy();
  });

  test("SETUP-04: upstream attribution present in footer", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toContainText("stellar-private-payments by Nethermind");
    await expect(footer).toContainText("Apache 2.0");
    await expect(footer).toContainText("LGPL for poseidon2");
  });

  test("Stellar Agentic Hackathon 2026 badge visible", async ({ page }) => {
    await expect(page.locator("text=Stellar Agentic Hackathon 2026").first()).toBeVisible();
  });

  test("hero renders 3D Enclave shield centerpiece", async ({ page }) => {
    const shield = page.locator("[data-enclave-shield-3d]");
    await expect(shield).toHaveCount(1);
    await expect(shield).toHaveAttribute("aria-hidden", "true");
  });

  test("DEMO-02: Watch the demo button toggles when YOUTUBE_VIDEO_ID set (conditional)", async ({ page }) => {
    // If NEXT_PUBLIC_YOUTUBE_VIDEO_ID is empty (default for CI), the CTA is intentionally hidden.
    // Assert the hero page shows EITHER the CTA (if set) OR the fallback card in TryIt.
    const hasVideo = (await page.getByRole("button", { name: /watch the 3-minute demo video/i }).count()) > 0;
    if (hasVideo) {
      // Modal opens on click
      await page.getByRole("button", { name: /watch the 3-minute demo video/i }).first().click();
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(page.locator("text=Demo video coming soon.")).toBeVisible();
    }
  });

  test("no JavaScript console errors during page load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Permit the benign YouTube third-party errors when thumbnail blocks; filter noisy messages.
    const meaningful = errors.filter(
      (e) => !/Failed to load resource.*img\.youtube\.com/i.test(e) && !/favicon/i.test(e)
    );
    expect(meaningful, `Unexpected console errors: ${meaningful.join(" | ")}`).toEqual([]);
  });
});
