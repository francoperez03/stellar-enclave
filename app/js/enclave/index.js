/**
 * Enclave page entry. Wires DOM events to enclave domain modules.
 *
 * Responsibilities:
 *   - Load /deployments.json and surface a banner on failure
 *   - Wire Freighter connect button → connectWallet()
 *   - After connect: render org-bootstrap-card or org-card based on IndexedDB state
 *   - Dispatch createOrg / depositForOrg / enrollAgent on button clicks
 *   - Render agents list from registry
 *   - Handle modal open / close / keyboard (Escape)
 *   - Activity log + toast notifications (duplicated from admin.js to avoid editing upstream)
 *
 * @module enclave/index
 */

import { connectWallet, signWalletTransaction, signWalletAuthEntry, getWalletNetwork } from '../wallet.js';
import { initProverWasm } from '../bridge.js';
import { createOrg } from './org.js';
import { depositForOrg } from './deposit.js';
import { enrollAgent } from './enroll.js';
import { getCachedOrgKeys } from './keys.js';
import { getOrgByAdmin, listAgents } from './registry.js';
import { triggerBundleDownload } from './bundle.js';

// ---------------------------------------------------------------------------
// Page state
// ---------------------------------------------------------------------------

const state = {
    wallet: { connected: false, address: null, network: null },
    deployments: null,
    activeOrg: null,
};

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const els = {
    connectBtn:           document.getElementById('connect-freighter-btn'),
    networkChip:          document.getElementById('network-chip'),
    deploymentsBanner:    document.getElementById('deployments-banner'),
    reloadPageBtn:        document.getElementById('reload-page-btn'),
    orgBootstrapCard:     document.getElementById('org-bootstrap-card'),
    orgBootstrapError:    document.getElementById('org-bootstrap-error'),
    createOrgBtn:         document.getElementById('create-org-btn'),
    createOrgBtnText:     document.getElementById('create-org-btn-text'),
    orgCard:              document.getElementById('org-card'),
    orgIdReadout:         document.getElementById('org-id-readout'),
    orgPubkeyReadout:     document.getElementById('org-pubkey-readout'),
    aspLeafReadout:       document.getElementById('asp-leaf-readout'),
    aspLeafIndexReadout:  document.getElementById('asp-leaf-index-readout'),
    orgCreatedAtReadout:  document.getElementById('org-created-at-readout'),
    orgTxHashReadout:     document.getElementById('org-tx-hash-readout'),
    agentsList:           document.getElementById('agents-list'),
    depositAmountInput:   document.getElementById('deposit-amount-input'),
    depositBtn:           document.getElementById('deposit-btn'),
    depositBtnText:       document.getElementById('deposit-btn-text'),
    enrollAgentBtn:       document.getElementById('enroll-agent-btn'),
    enrollModal:          document.getElementById('enroll-modal'),
    enrollNameInput:      document.getElementById('enroll-agent-name-input'),
    enrollNameError:      document.getElementById('enroll-name-error'),
    enrollSubmitBtn:      document.getElementById('enroll-submit-btn'),
    enrollSubmitBtnText:  document.getElementById('enroll-submit-btn-text'),
    enrollCloseBtn:       document.getElementById('enroll-close-btn'),
    activityLog:          document.getElementById('activity-log'),
    toastContainer:       document.getElementById('toast-container'),
    tplToast:             document.getElementById('tpl-toast'),
    tplAgentRow:          document.getElementById('tpl-agent-row'),
};

// ---------------------------------------------------------------------------
// Helpers (duplicated from admin.js to avoid editing upstream)
// ---------------------------------------------------------------------------

/**
 * Append a timestamped line to the activity log.
 * @param {string} msg
 */
function logActivity(msg) {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    if (els.activityLog) {
        els.activityLog.textContent += line + '\n';
        els.activityLog.scrollTop = els.activityLog.scrollHeight;
    }
    console.log('[Enclave]', msg);
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration
 */
function showToast(message, type = 'info', duration = 4000) {
    if (!els.tplToast || !els.toastContainer) return;
    const clone = els.tplToast.content.cloneNode(true);
    const toast = clone.querySelector('.toast');
    const icon  = toast.querySelector('.toast-icon');
    toast.querySelector('.toast-message').textContent = message;

    if (type === 'success') {
        icon.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
        toast.classList.add('border-emerald-500/50');
        icon.classList.add('text-emerald-500');
    } else {
        icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
        toast.classList.add('border-red-500/50');
        icon.classList.add('text-red-500');
    }

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    els.toastContainer.appendChild(clone);

    const el = els.toastContainer.lastElementChild;
    setTimeout(() => {
        if (el) {
            el.style.opacity = '0';
            el.style.transform = 'translateX(100%)';
        }
    }, duration - 200);
    setTimeout(() => el?.remove(), duration);
}

/**
 * Truncate a long string to `start` chars + … + last `end` chars.
 * @param {string} addr
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function shortAddress(addr, start = 6, end = 4) {
    if (!addr || addr.length <= start + end + 1) return addr || '';
    return `${addr.slice(0, start)}\u2026${addr.slice(-end)}`;
}

/**
 * Build the signerOptions object Enclave modules expect.
 * Uses upstream wallet.js helpers.
 * @returns {{ publicKey: string, signTransaction: Function, signAuthEntry: Function }}
 */
function buildSignerOptions() {
    return {
        publicKey: state.wallet.address,
        signTransaction: async (xdr, opts) => {
            return signWalletTransaction(xdr, {
                networkPassphrase: opts?.networkPassphrase,
                address: state.wallet.address,
                ...opts,
            });
        },
        signAuthEntry: async (entryXdr, opts) => {
            return signWalletAuthEntry(entryXdr, {
                networkPassphrase: opts?.networkPassphrase,
                address: state.wallet.address,
                ...opts,
            });
        },
    };
}

// ---------------------------------------------------------------------------
// Deployments load
// ---------------------------------------------------------------------------

/**
 * Fetch /deployments.json and populate state.deployments.
 * Shows the banner on failure.
 * @returns {Promise<boolean>}
 */
async function loadDeployments() {
    try {
        const r = await fetch('/deployments.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (d.initialized !== true) throw new Error('initialized !== true');
        state.deployments = d;
        els.deploymentsBanner.hidden = true;
        logActivity(`Deployments loaded: pool=${shortAddress(d.pool, 8, 6)}`);
        return true;
    } catch (e) {
        els.deploymentsBanner.hidden = false;
        logActivity(`Deployments load failed: ${e.message}`);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Re-render the org region for the currently connected account.
 * Shows org-bootstrap-card if no org exists, org-card if it does.
 */
async function renderForCurrentAccount() {
    if (!state.wallet.connected || !state.deployments) {
        els.orgBootstrapCard.hidden = true;
        els.orgCard.hidden = true;
        return;
    }

    let org;
    try {
        org = await getOrgByAdmin(state.wallet.address);
    } catch (e) {
        logActivity(`Registry read failed: ${e.message}`);
        return;
    }
    state.activeOrg = org;

    if (!org) {
        els.orgBootstrapCard.hidden = false;
        els.orgCard.hidden = true;
        return;
    }

    // Org exists — populate org-card
    els.orgBootstrapCard.hidden = true;
    els.orgCard.hidden = false;

    els.orgIdReadout.textContent        = org.orgId;
    els.orgPubkeyReadout.textContent    = shortAddress(org.orgSpendingPubKey, 10, 8);
    els.aspLeafReadout.textContent      = shortAddress(org.aspLeaf, 10, 8);
    els.aspLeafIndexReadout.textContent = String(org.aspLeafIndex);
    els.orgCreatedAtReadout.textContent = org.createdAt
        ? new Date(org.createdAt).toLocaleString()
        : '--';

    // Tx hash: clickable link to Stellar Expert
    const txHash = org.deployTxHash || '';
    if (txHash && txHash !== 'unknown') {
        const expertUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
        els.orgTxHashReadout.innerHTML =
            `<a href="${expertUrl}" target="_blank" rel="noopener noreferrer" ` +
            `class="text-brand-400 hover:text-brand-300 underline underline-offset-2">${shortAddress(txHash, 8, 6)}</a>`;
    } else {
        els.orgTxHashReadout.textContent = shortAddress(txHash, 8, 6) || '--';
    }

    // Agents list
    let agents = [];
    try {
        agents = await listAgents(org.orgId);
    } catch (e) {
        logActivity(`Agents list read failed: ${e.message}`);
    }

    els.agentsList.innerHTML = '';
    if (agents.length === 0) {
        els.agentsList.innerHTML =
            '<div class="flex flex-col gap-3">' +
            '<p class="text-xs text-dark-400">No agents enrolled yet. Agents receive a one-time JSON bundle with your org\'s spending key. Share the bundle out of band.</p>' +
            '</div>';
    } else {
        for (const a of agents) {
            const row = els.tplAgentRow.content.cloneNode(true);
            row.querySelector('[data-agent-name]').textContent   = a.agentName;
            row.querySelector('[data-agent-when]').textContent   = a.enrolledAt
                ? new Date(a.enrolledAt).toLocaleString()
                : '';
            row.querySelector('[data-agent-pubkey]').textContent = shortAddress(a.authPubKey, 10, 8);

            // Wire copy button on the row
            const copyBtn = row.querySelector('.copy-agent-key-btn');
            const fullKey = a.authPubKey;
            copyBtn?.addEventListener('click', () => {
                navigator.clipboard.writeText(fullKey)
                    .then(() => showToast('Copied to clipboard.', 'success', 2000))
                    .catch(() => showToast('Could not copy.', 'error', 2000));
            });

            els.agentsList.appendChild(row);
        }
    }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleConnect() {
    try {
        const address = await connectWallet();
        let network = 'testnet';
        try {
            const nd = await getWalletNetwork();
            network = nd.network || 'testnet';
        } catch (_) { /* non-fatal */ }

        state.wallet = { connected: true, address, network };
        const labelText = shortAddress(address);
        els.connectBtn.querySelector('span').textContent = labelText;
        els.networkChip.textContent =
            /testnet/i.test(network) ? 'Testnet' : network;
        logActivity(`Connected ${shortAddress(address, 8, 6)} on ${network}`);
        await renderForCurrentAccount();
    } catch (e) {
        showToast(`Could not connect: ${e.message}`, 'error');
        logActivity(`Connect failed: ${e.message}`);
    }
}

async function handleCreateOrg() {
    if (!state.wallet.connected) {
        return showToast('Connect Freighter first.', 'error');
    }
    if (!state.deployments) {
        return showToast('Deployments missing.', 'error');
    }

    els.createOrgBtn.disabled = true;
    els.createOrgBtnText.textContent = 'Creating org\u2026';
    els.orgBootstrapError.hidden = true;

    try {
        const result = await createOrg({
            adminAddress: state.wallet.address,
            deployments: state.deployments,
            signerOptions: buildSignerOptions(),
            onStatus: logActivity,
        });
        showToast(`Org created — ${result.orgId} is live.`, 'success');
        logActivity(`Org created: ${result.orgId}`);
        await renderForCurrentAccount();
    } catch (e) {
        const msg = e.message || String(e);
        showToast(`Could not create org: ${msg}`, 'error');
        logActivity(`Create org failed: ${msg}`);
        // Surface idempotency / config errors inline under the button
        els.orgBootstrapError.textContent = msg;
        els.orgBootstrapError.hidden = false;
    } finally {
        els.createOrgBtn.disabled = false;
        els.createOrgBtnText.textContent = 'Create Org';
    }
}

async function handleDeposit() {
    if (!state.activeOrg) {
        return showToast('Create an org first.', 'error');
    }
    const raw = els.depositAmountInput.value;
    const amt = parseFloat(raw);
    if (!(amt > 0)) {
        return showToast('Enter a positive amount.', 'error');
    }
    const amountStroops = BigInt(Math.round(amt * 1e7));

    els.depositBtn.disabled = true;
    els.depositBtnText.textContent = 'Depositing\u2026';

    try {
        const result = await depositForOrg({
            adminAddress: state.wallet.address,
            amountStroops,
            deployments: state.deployments,
            signerOptions: buildSignerOptions(),
            onStatus: logActivity,
        });
        if (!result.success) throw new Error(result.error || 'deposit failed');
        showToast(`Deposited ${amt} USDC \u2014 commitment recorded.`, 'success');
        if (result.txHash) {
            logActivity(`Deposit confirmed: tx ${result.txHash}`);
        }
        await renderForCurrentAccount();
    } catch (e) {
        const msg = e.message || String(e);
        showToast(`Could not deposit: ${msg}`, 'error');
        logActivity(`Deposit failed: ${msg}`);
    } finally {
        els.depositBtn.disabled = false;
        els.depositBtnText.textContent = 'Deposit USDC';
    }
}

function openEnrollModal() {
    els.enrollModal.hidden = false;
    els.enrollNameInput.value = '';
    els.enrollNameError.hidden = true;
    els.enrollNameError.textContent = '';
    els.enrollNameInput.focus();
}

function closeEnrollModal() {
    els.enrollModal.hidden = true;
    els.enrollNameInput.value = '';
    els.enrollNameError.hidden = true;
}

async function handleEnrollSubmit() {
    if (!state.activeOrg) {
        return showToast('Create an org first.', 'error');
    }
    const name = els.enrollNameInput.value.trim();
    if (!name) {
        els.enrollNameError.textContent = 'Agent name is required.';
        els.enrollNameError.hidden = false;
        return;
    }

    els.enrollSubmitBtn.disabled = true;
    els.enrollSubmitBtnText.textContent = 'Enrolling\u2026';
    els.enrollNameError.hidden = true;

    try {
        const { bundle } = await enrollAgent({
            adminAddress: state.wallet.address,
            orgId: state.activeOrg.orgId,
            agentName: name,
            deployments: state.deployments,
        });
        triggerBundleDownload(bundle, name);
        showToast(`Enrolled ${name} \u2014 bundle downloaded.`, 'success');
        logActivity(`Enrolled agent ${name}`);
        closeEnrollModal();
        await renderForCurrentAccount();
    } catch (e) {
        const msg = e.message || String(e);
        showToast(`Could not enroll agent: ${msg}`, 'error');
        logActivity(`Enroll failed: ${msg}`);
        els.enrollNameError.textContent = msg;
        els.enrollNameError.hidden = false;
    } finally {
        els.enrollSubmitBtn.disabled = false;
        els.enrollSubmitBtnText.textContent = 'Enroll & Download Bundle';
    }
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard wiring for org-card data tiles
// ---------------------------------------------------------------------------

function wireCopyButtons() {
    // Tile copy buttons (org-card data tiles)
    document.querySelectorAll('.copy-tile-btn').forEach(btn => {
        const targetId = btn.dataset.target;
        btn.addEventListener('click', () => {
            const el = document.getElementById(targetId);
            const text = el?.textContent?.trim() || '';
            if (!text || text === '--') return showToast('Nothing to copy.', 'error', 2000);
            navigator.clipboard.writeText(text)
                .then(() => showToast('Copied to clipboard.', 'success', 2000))
                .catch(() => showToast('Could not copy.', 'error', 2000));
        });
    });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
    try {
        await initProverWasm();
    } catch (e) {
        console.warn('[Enclave] prover WASM init failed (non-fatal):', e);
    }
    els.connectBtn.addEventListener('click', handleConnect);
    els.createOrgBtn.addEventListener('click', handleCreateOrg);
    els.depositBtn.addEventListener('click', handleDeposit);
    els.enrollAgentBtn.addEventListener('click', openEnrollModal);
    els.enrollCloseBtn.addEventListener('click', closeEnrollModal);
    els.enrollSubmitBtn.addEventListener('click', handleEnrollSubmit);
    els.reloadPageBtn.addEventListener('click', () => location.reload());

    // Modal dismiss on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !els.enrollModal.hidden) closeEnrollModal();
    });

    // Submit on Enter inside agent name input
    els.enrollNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleEnrollSubmit();
    });

    wireCopyButtons();

    await loadDeployments();
    logActivity('Enclave admin ready. Click Connect Freighter to begin.');
}

init().catch(e => {
    console.error('[Enclave] init failed', e);
    logActivity(`Init error: ${e.message}`);
});
