/**
 * Enclave dashboard — domain module (no DOM).
 *
 * Plan 05-06.
 *
 * Responsibilities:
 *   - Derive the active orgId from a pasted admin privkey hex string.
 *   - Load agents (registry), note tags (registry), settlements (facilitator HTTP).
 *   - Filter settlements to this org via the Plan 05-02 by_nullifier index.
 *   - Compute balance = deposited − spent, in USDC base units (BigInt).
 *
 * The UI layer (renderDashboard) is co-located in this file for demo simplicity,
 * but the data-loading path is DOM-free and unit-testable.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { getOrgByAdmin, listAgents, listNoteTags, getNoteTagByNullifier } from './registry.js';

/**
 * Derive the active orgId for a pasted admin privkey.
 * Returns null if no enclave_orgs row exists for the derived admin address —
 * that is the DASH-02 isolation mechanism.
 *
 * @param {string} adminPrivKeyHex  Stellar S... secret OR 64-char raw hex seed
 * @returns {Promise<string|null>}
 */
export async function deriveOrgIdFromPrivKey(adminPrivKeyHex) {
    const trimmed = (adminPrivKeyHex || '').trim();
    let kp;
    if (trimmed.startsWith('S') && trimmed.length >= 56) {
        kp = Keypair.fromSecret(trimmed);
    } else {
        // treat as 32-byte hex seed
        const hex = trimmed.replace(/^0x/, '');
        if (hex.length !== 64) {
            throw new Error('Admin privkey must be a Stellar S... secret or a 64-char hex seed.');
        }
        const seed = new Uint8Array(32);
        for (let i = 0; i < 32; i++) seed[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        kp = Keypair.fromRawEd25519Seed(Buffer.from(seed));
    }
    const adminAddress = kp.publicKey();
    const org = await getOrgByAdmin(adminAddress);
    return org ? org.orgId : null;
}

/**
 * Load all data needed to render the dashboard for the given orgId.
 * If orgId is null, returns empty data (DASH-02 isolation).
 *
 * @param {Object} params
 * @param {string|null} params.orgId
 * @param {string} params.facilitatorUrl
 * @param {typeof fetch} [params.fetchFn]
 * @returns {Promise<{balanceBaseUnits: bigint, agents: Array, history: Array, warnings: string[]}>}
 */
export async function loadDashboardData({ orgId, facilitatorUrl, fetchFn = globalThis.fetch }) {
    if (!orgId) {
        return { balanceBaseUnits: 0n, agents: [], history: [], warnings: [] };
    }
    const warnings = [];
    const [agents, noteTags] = await Promise.all([
        listAgents(orgId),
        listNoteTags(orgId),
    ]);

    let totalDeposited = 0n;
    for (const row of noteTags) {
        try { totalDeposited += BigInt(row.amount); } catch { /* malformed row — skip */ }
    }

    let settlements = [];
    try {
        const resp = await fetchFn(`${facilitatorUrl.replace(/\/+$/, '')}/settlements`);
        if (resp.ok) {
            settlements = await resp.json();
        } else {
            warnings.push(`GET /settlements returned ${resp.status}`);
        }
    } catch (e) {
        warnings.push(`GET /settlements failed: ${e.message ?? e}`);
    }

    // Filter settlements to this org via the Plan 05-02 by_nullifier index.
    const history = [];
    let totalSpent = 0n;
    for (const s of settlements) {
        if (!s || typeof s.nullifier !== 'string') continue;
        const row = await getNoteTagByNullifier(s.nullifier);
        if (row && row.orgId === orgId) {
            history.push(s);
            try {
                const amt = BigInt(s.amount);
                totalSpent += amt < 0n ? -amt : amt;
            } catch { /* skip malformed */ }
        }
    }

    return {
        balanceBaseUnits: totalDeposited - totalSpent,
        agents,
        history,
        warnings,
    };
}

// ---------------------------------------------------------------------------
// UI layer — renderDashboard
// ---------------------------------------------------------------------------

/**
 * Render the three dashboard tables. Idempotent: clears tbodies first.
 *
 * @param {Object} params
 * @param {string} params.adminPrivKeyHex
 * @param {string} params.facilitatorUrl
 * @param {HTMLElement} params.balanceTbody
 * @param {HTMLElement} params.agentsTbody
 * @param {HTMLElement} params.historyTbody
 * @param {HTMLElement} params.errorEl
 * @param {(msg: string) => void} [params.onStatus]
 */
export async function renderDashboard({
    adminPrivKeyHex, facilitatorUrl,
    balanceTbody, agentsTbody, historyTbody, errorEl, onStatus,
}) {
    // Clear previous render.
    balanceTbody.replaceChildren();
    agentsTbody.replaceChildren();
    historyTbody.replaceChildren();
    errorEl.hidden = true;
    errorEl.textContent = '';

    let orgId;
    try {
        orgId = await deriveOrgIdFromPrivKey(adminPrivKeyHex);
    } catch (e) {
        errorEl.textContent = `Could not parse admin key: ${e.message ?? e}`;
        errorEl.hidden = false;
        return;
    }

    if (!orgId) {
        errorEl.textContent = 'No org found for this admin key.';
        errorEl.hidden = false;
        return;
    }

    onStatus?.(`Loading dashboard for ${orgId}...`);
    const data = await loadDashboardData({ orgId, facilitatorUrl });
    for (const w of data.warnings) onStatus?.(`warning: ${w}`);

    // Balance table — show both total deposited and computed balance.
    const DIVISOR = 10_000_000n; // USDC has 7 decimals
    function formatUsdc(baseUnits) {
        const abs = baseUnits < 0n ? -baseUnits : baseUnits;
        const whole = abs / DIVISOR;
        const frac  = (abs % DIVISOR).toString().padStart(7, '0');
        return (baseUnits < 0n ? '-' : '') + `${whole}.${frac}`;
    }

    const balanceRow = document.createElement('tr');
    balanceRow.innerHTML = `<td>Treasury Balance (USDC)</td><td>${escapeHtml(formatUsdc(data.balanceBaseUnits))}</td>`;
    balanceTbody.appendChild(balanceRow);

    // Agents table.
    if (data.agents.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="3">No agents enrolled.</td>`;
        agentsTbody.appendChild(tr);
    } else {
        for (const a of data.agents) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escapeHtml(a.agentName)}</td><td>${escapeHtml(a.authPubKey)}</td><td>${escapeHtml(a.enrolledAt ?? '')}</td>`;
            agentsTbody.appendChild(tr);
        }
    }

    // History table.
    if (data.history.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="4">No spend history.</td>`;
        historyTbody.appendChild(tr);
    } else {
        for (const s of data.history) {
            const tr = document.createElement('tr');
            const ts = new Date(s.ts).toISOString();
            tr.innerHTML = `<td>${escapeHtml(ts)}</td><td>${escapeHtml(s.recipient)}</td><td>${escapeHtml(s.amount)}</td><td>${escapeHtml(s.txHash)}</td>`;
            historyTbody.appendChild(tr);
        }
    }
    onStatus?.(`Dashboard loaded: orgId=${orgId} agents=${data.agents.length} history=${data.history.length}`);
}

/**
 * HTML-escape user-controlled strings before inserting into table cells.
 * Guards against XSS in any field returned from registry or facilitator.
 * @param {string|number|null|undefined} s
 * @returns {string}
 */
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
