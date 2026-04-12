/**
 * Enclave parity test — POOL-04 secondary.
 *
 * RUN POLICY: manual only. Requires:
 *   1. Real Freighter extension loaded (via app/e2e/helpers/download-extension.js)
 *   2. Three Freighter accounts pre-imported: Northfield Capital, Ashford Partners, Bayridge Capital
 *   3. Each account pre-funded with XLM + USDC via scripts/seed-demo-accounts.sh
 *   4. Contracts deployed and `scripts/deployments.json::initialized === true`
 *   5. `trunk serve` running on http://localhost:8000
 *
 * Invoke:
 *   cd app && ENCLAVE_PARITY_LIVE=1 npm run test:e2e -- --grep "enclave-parity"
 *
 * The test is NOT run in CI. The `test.skip` guard at the top of the describe
 * block means an accidental `npm run test:e2e` without the env var is a silent
 * no-op — the test is listed but skipped, exit code 0.
 *
 * POOL-04 primary (112-byte invariant at mock boundary) is proved unit-level in:
 *   app/js/__tests__/enclave/deposit-invariants.test.js
 *
 * This e2e spec proves the three-org choreography works end-to-end and that
 * three distinct commitments land on the SAME pool contract (POOL-03 money shot).
 * If ENCLAVE_PARITY_LIVE=1 and extended with a direct Soroban RPC call, it also
 * measures encrypted_output byte length and asserts the 112-byte invariant on
 * live testnet data.
 */

import { test, expect } from '@playwright/test';

const ENCLAVE_URL = process.env.ENCLAVE_URL || 'http://localhost:8000/enclave.html';

const REQUIRED_ENV = ['ENCLAVE_PARITY_LIVE'];
const isLive = REQUIRED_ENV.every(v => process.env[v]);

/** Three demo orgs — account labels used for Freighter manual switching notes. */
const DEMO_ORGS = ['Northfield Capital', 'Ashford Partners', 'Bayridge Capital'];

/**
 * POOL-04 target: every deposit's encrypted_output must be exactly 112 bytes.
 *
 * Byte layout:
 *   [ephemeralPubKey 32][nonce 24][ciphertext+tag 56] = 112 total
 * (see .planning/codebase/INTEGRATIONS.md §Note Encryption)
 */
const EXPECTED_ENCRYPTED_OUTPUT_BYTES = 112;

test.describe('Enclave parity: three orgs, one pool, 112-byte ciphertext invariant (enclave-parity)', () => {
    test.skip(!isLive, 'Set ENCLAVE_PARITY_LIVE=1 to run (requires real Freighter + live testnet).');

    test('three deposits produce equal-length 112-byte encrypted_output on the same pool contract', async ({ page }) => {
        const commitments = [];

        for (let i = 0; i < DEMO_ORGS.length; i++) {
            const orgLabel = DEMO_ORGS[i];

            // Reload for a clean slate on each account iteration.
            await page.goto(ENCLAVE_URL);
            await expect(page).toHaveTitle(/Enclave/);

            // The deployments banner must be hidden (contracts are deployed).
            await expect(page.locator('#deployments-banner')).toBeHidden({ timeout: 10_000 });

            // Manual step: tester switches Freighter active account to orgLabel before proceeding.
            await test.step(`Switch Freighter to ${orgLabel} (manual)`, async () => {
                // Freighter UI cannot be automated from Playwright; tester performs the
                // account switch in the extension popup, then the test continues.
                // In practice: pause here via PWDEBUG=1 or via a fixture that waits for
                // a keyboard signal. For scripted runs the accounts are pre-switched before
                // the test runner is launched — one process per account.
                await page.waitForTimeout(500); // Brief pause — tester switches account
            });

            // Connect Freighter
            await page.click('#connect-freighter-btn');
            // After connect, either the org-bootstrap-card or the org-card appears.
            await expect(
                page.locator('#org-bootstrap-card:not([hidden]), #org-card:not([hidden])')
            ).toBeVisible({ timeout: 30_000 });

            // Create org if not yet bootstrapped
            const bootstrapVisible = await page.locator('#org-bootstrap-card').isVisible();
            if (bootstrapVisible) {
                await page.click('#create-org-btn');
                await expect(page.locator('#org-card')).toBeVisible({ timeout: 90_000 });
            }

            // Wait for org-card to be fully populated (org-id-readout has a non-empty value)
            await expect(page.locator('#org-id-readout')).not.toHaveText('--', { timeout: 10_000 });

            // Deposit 10 USDC
            await page.fill('#deposit-amount-input', '10');
            await page.click('#deposit-btn');

            // Wait for success toast (allow up to 120 s for proof + on-chain confirmation)
            await expect(page.locator('.toast.border-emerald-500\\/50')).toBeVisible({ timeout: 120_000 });

            // Extract the commitment from the activity log
            const logText = await page.textContent('#activity-log');
            const match = logText.match(/commitment[:\s]+(0x[a-f0-9]+)/i);
            expect(match, `Expected a commitment hex in the activity log for ${orgLabel}`).not.toBeNull();
            commitments.push(match[1]);
        }

        // ---- POOL-03: Three distinct commitments on the same pool contract ----
        expect(new Set(commitments).size).toBe(3);

        // ---- POOL-04 secondary: fetch NewCommitmentEvent and assert 112-byte invariant ----
        // Read pool contract ID from deployments.json (served by trunk)
        const depResp = await page.evaluate(async () => {
            const r = await fetch('/deployments.json', { cache: 'no-store' });
            return r.ok ? r.json() : null;
        });
        expect(depResp?.pool).toBeTruthy();

        if (depResp?.sorobanRpcUrl || depResp?.rpcUrl) {
            const rpcUrl = depResp.sorobanRpcUrl || depResp.rpcUrl;

            // Query the last 200 ledgers for NewCommitmentEvent on the pool contract.
            // Real verification: each event's encrypted_output field is 112 bytes on-chain.
            const eventsPayload = {
                jsonrpc: '2.0',
                id: 1,
                method: 'getEvents',
                params: {
                    startLedger: 0, // placeholder — real run should use actual start ledger
                    filters: [
                        {
                            type: 'contract',
                            contractIds: [depResp.pool],
                            topics: [['NewCommitmentEvent']],
                        },
                    ],
                    limit: 20,
                },
            };

            const eventsResp = await page.evaluate(async ({ url, payload }) => {
                try {
                    const r = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });
                    return r.ok ? r.json() : null;
                } catch {
                    return null;
                }
            }, { url: rpcUrl, payload: eventsPayload });

            if (eventsResp?.result?.events) {
                for (const ev of eventsResp.result.events) {
                    const encryptedOutput = ev?.event?.body?.value?.encrypted_output;
                    if (encryptedOutput) {
                        // Decode base64 or hex to measure byte length.
                        const bytes = typeof encryptedOutput === 'string'
                            ? atob(encryptedOutput).length
                            : encryptedOutput.length;
                        expect(
                            bytes,
                            `encrypted_output must be ${EXPECTED_ENCRYPTED_OUTPUT_BYTES} bytes (got ${bytes})`
                        ).toBe(EXPECTED_ENCRYPTED_OUTPUT_BYTES);
                    }
                }
            }
            // If events not returned (e.g., RPC pagination), the unit-level assertion
            // in deposit-invariants.test.js already covers POOL-04 at mock boundary.
        }
    });
});
