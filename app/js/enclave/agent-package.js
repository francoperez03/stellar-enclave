/**
 * Agent-package exporters — package an agent's bundle + org notes + run
 * script into a single downloadable artifact, either as a ZIP (for humans)
 * or as a single Markdown file (for AI coding agents like Claude Code /
 * OpenCode to unpack and execute).
 *
 * Reuses the existing bundle (from enrollAgent) and the existing
 * state.exportNotes() Blob generator. No re-derivation of keys.
 *
 * @module enclave/agent-package
 */

import JSZip from 'jszip';

const REPO_PATH_DEFAULT = '$HOME/repos/stellar-projects/stellar-enclave';

/**
 * Generate the run.sh script that the agent executes.
 *
 * Env-var overrides are accepted for portability — if the package is unzipped
 * somewhere other than the default layout, the operator can override
 * ENCLAVE_PROVING_ARTIFACTS_PATH / FACILITATOR_URL / DEMO_URL in their shell.
 */
export function generateRunScript({ facilitatorUrl, demoUrl }) {
    return `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Repo location — override via env if you cloned elsewhere
export ENCLAVE_REPO_PATH="\${ENCLAVE_REPO_PATH:-${REPO_PATH_DEFAULT}}"

# Paths (override via env if needed)
export ENCLAVE_BUNDLE_PATH="$PWD/bundle.json"
export ENCLAVE_NOTES_PATH="$PWD/notes.json"
export ENCLAVE_PROVING_ARTIFACTS_PATH="\${ENCLAVE_PROVING_ARTIFACTS_PATH:-$ENCLAVE_REPO_PATH/dist}"

# Service URLs (override via env if deploying elsewhere)
export FACILITATOR_URL="\${FACILITATOR_URL:-${facilitatorUrl}}"
export DEMO_URL="\${DEMO_URL:-${demoUrl}}"

AGENT_MODULE="$ENCLAVE_REPO_PATH/packages/agent/dist/index.js"
if [[ ! -f "$AGENT_MODULE" ]]; then
  echo "[agent-package] agent module not found at $AGENT_MODULE" >&2
  echo "[agent-package] set ENCLAVE_REPO_PATH to your stellar-enclave checkout and re-run" >&2
  exit 1
fi

echo "[agent-package] repo:       $ENCLAVE_REPO_PATH"
echo "[agent-package] bundle:     $ENCLAVE_BUNDLE_PATH"
echo "[agent-package] notes:      $ENCLAVE_NOTES_PATH"
echo "[agent-package] artifacts:  $ENCLAVE_PROVING_ARTIFACTS_PATH"
echo "[agent-package] facilitator:$FACILITATOR_URL"
echo "[agent-package] demo:       $DEMO_URL"
echo

node --input-type=module -e "
import { createAgent } from '$AGENT_MODULE';
const agent = await createAgent();
const res = await agent.fetch(process.env.DEMO_URL);
console.log('status:', res.status);
console.log('body:  ', await res.text());
"
`;
}

/**
 * Generate a README.md for human consumers of the ZIP package.
 */
export function generateReadme({ orgId, agentName, facilitatorUrl, demoUrl }) {
    return `# Agent Package — ${agentName}

**Org:** \`${orgId}\`
**Generated:** ${new Date().toISOString()}

## Contents

- \`bundle.json\` — your agent's admin + spending keys (KEEP PRIVATE)
- \`notes.json\` — the org's unspent shielded notes (also private)
- \`run.sh\` — the script that calls the gated demo API with a shielded payment
- \`.enclave-config\` — facilitator + demo URL context

## Quickstart

Prerequisites: the Enclave facilitator and demo app must be running locally.

\`\`\`bash
chmod +x run.sh
./run.sh
\`\`\`

Expected output:

\`\`\`
status: 200
body:   { ... exchange rate payload ... }
\`\`\`

## For AI coding agents (Claude Code, OpenCode, …)

Point the agent at this folder and it will execute \`run.sh\`. All paths are
relative to the folder; no env-var setup required unless you want to override.

## Config snapshot

- facilitatorUrl: \`${facilitatorUrl}\`
- demoUrl:        \`${demoUrl}\`
`;
}

/**
 * Build the shared file payload (bundle/notes/run/README/config).
 */
async function buildPayload({ bundle, notesBlob, agentName, facilitatorUrl, demoUrl }) {
    const bundleText = JSON.stringify(bundle, null, 2);
    const notesText = notesBlob ? await notesBlob.text() : JSON.stringify({ version: 1, notes: [] }, null, 2);
    const runScript = generateRunScript({ facilitatorUrl, demoUrl });
    const readme = generateReadme({ orgId: bundle.orgId, agentName, facilitatorUrl, demoUrl });
    const config = `FACILITATOR_URL=${facilitatorUrl}\nDEMO_URL=${demoUrl}\nORG_ID=${bundle.orgId}\nAGENT_NAME=${agentName}\n`;
    return { bundleText, notesText, runScript, readme, config };
}

function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function todayStamp() {
    return new Date().toISOString().slice(0, 10);
}

function baseName(agentName) {
    const safe = String(agentName).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    return `${safe}-agent-${todayStamp()}`;
}

/**
 * Download the agent package as a ZIP.
 */
export async function downloadAgentPackageZip({ bundle, notesBlob, agentName, facilitatorUrl, demoUrl }) {
    const payload = await buildPayload({ bundle, notesBlob, agentName, facilitatorUrl, demoUrl });
    const zip = new JSZip();
    const folder = zip.folder(baseName(agentName));
    folder.file('bundle.json', payload.bundleText);
    folder.file('notes.json', payload.notesText);
    folder.file('run.sh', payload.runScript, { unixPermissions: '755' });
    folder.file('README.md', payload.readme);
    folder.file('.enclave-config', payload.config);

    const blob = await zip.generateAsync({
        type: 'blob',
        platform: 'UNIX',
        compression: 'DEFLATE',
    });
    triggerBlobDownload(blob, `${baseName(agentName)}.zip`);
}

/**
 * Download the agent package as a single Markdown file with embedded code
 * blocks. Format is AI-agent-friendly: each block is preceded by a "File:"
 * heading that coding agents recognize.
 */
export async function downloadAgentPackageMarkdown({ bundle, notesBlob, agentName, facilitatorUrl, demoUrl }) {
    const payload = await buildPayload({ bundle, notesBlob, agentName, facilitatorUrl, demoUrl });
    const dir = baseName(agentName);
    const md = `# Agent Package — ${agentName}

**Org:** \`${bundle.orgId}\`
**Generated:** ${new Date().toISOString()}

This markdown file is a self-contained agent package. Hand it to an AI coding
agent (Claude Code, OpenCode, Cursor, …) along with the instruction:

> Create a folder named \`${dir}\`, save each code block below into the
> filename shown above it inside that folder, \`chmod +x run.sh\`, then
> execute \`./run.sh\` and show me the output.

---

## File: \`${dir}/bundle.json\`

\`\`\`json
${payload.bundleText}
\`\`\`

## File: \`${dir}/notes.json\`

\`\`\`json
${payload.notesText}
\`\`\`

## File: \`${dir}/run.sh\`

\`\`\`bash
${payload.runScript}\`\`\`

## File: \`${dir}/.enclave-config\`

\`\`\`
${payload.config}\`\`\`

## File: \`${dir}/README.md\`

\`\`\`markdown
${payload.readme}\`\`\`

---

## Manual alternative

If you prefer to do it by hand:

1. Create \`${dir}/\` and save each block above under the shown filename.
2. \`cd ${dir} && chmod +x run.sh && ./run.sh\`
3. Expected: \`status: 200\` followed by the demo endpoint response body.
`;
    const blob = new Blob([md], { type: 'text/markdown' });
    triggerBlobDownload(blob, `${baseName(agentName)}.md`);
}
