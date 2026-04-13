# Enclave Ops Runbook

Solo-builder ops reference for the 2026-04-10 to 2026-04-17 hackathon window.
Open this file each morning before starting work.

---

## Daily TTL Routine (OPS-02)

Manual discipline. Run every morning until 2026-04-17.

```bash
./scripts/preflight.sh pool-ttl-bump
```

Bumps Soroban persistent storage TTL for all four contracts:

| Contract              | Key in deployments.json |
|-----------------------|------------------------|
| `pool`                | `.pool`                |
| `asp_membership`      | `.asp_membership`      |
| `asp_non_membership`  | `.asp_non_membership`  |
| `verifier`            | `.verifier`            |

Each call extends TTL by 535680 ledgers (~30 days at 5s/ledger). Running it
daily is defensive over-coverage — you are rebuilding a ~30-day buffer on top
of a buffer that only shrinks by one day per day. The safety margin exists
because demo recording runs 2026-04-15 to 2026-04-16 and the pool enforces a
minimum TTL at transact time. Miss a day and nothing breaks immediately, but
two consecutive missed days start eroding the buffer. Miss enough days and the
demo dies silently mid-recording (Pitfall 10, 7-day retention window).

Deadline: 2026-04-17. After hackathon submission the routine is no longer
required.

Optional flags:

```bash
# Extend to a specific ledger count instead of the default 535680
./scripts/preflight.sh pool-ttl-bump --ledgers-to-extend 1000000

# Print commands without executing (sanity check)
./scripts/preflight.sh pool-ttl-bump --dry-run
```

---

## Preflight Before Recording (OPS-01)

Run this before every recording take:

```bash
FACILITATOR_URL=http://localhost:4021 ./scripts/preflight.sh full-check
```

`FACILITATOR_URL` defaults to `http://localhost:4021` if not set.

The six checks performed:

1. **TTL > 48 h** — pool + asp_membership + asp_non_membership + verifier all
   have persistent storage TTL above 48 hours.
2. **/health returns 200** — facilitator HTTP health check passes.
3. **USDC float > threshold** — facilitator USDC float is above the minimum
   required to cover the demo (default: 10 USDC, ~3x the demo budget per
   FACIL-07).
4. **Event window < 6 days** — oldest event in the RPC event feed is less than
   6 days old (Pitfall 11, 7-day retention). Avoids a stale-event silent
   failure on recording day.
5. **Deployments liveness** — every contract address in `scripts/deployments.json`
   responds to a live on-chain query.
6. **REGISTRY_FROZEN=1** — the `REGISTRY_FROZEN` env var is set to `1`. This
   must be set before recording to prevent ASP root drift (ORG-04).

Output is a PASS/FAIL table per check with a final summary line. Exit 0 only
if all six pass.

Threshold overrides:

```bash
./scripts/preflight.sh full-check \
  --ttl-min 24 \
  --float-min 20 \
  --event-window-max 5
```

---

## Enrollment Freeze (ORG-04)

Before starting the recording session, lock enrollment:

```bash
export REGISTRY_FROZEN=1
./scripts/preflight.sh freeze-check
```

The `freeze-check` subcommand reads `REGISTRY_FROZEN` from the environment and
exits non-zero if it is not `1`. The `full-check` command (above) calls
`freeze-check` as its sixth check.

The browser admin UI at `app/enclave.html` honors `?frozen=1` in the query
string: org creation, agent enrollment, and deposit buttons are all disabled
when that parameter is present. Use `app/enclave.html?frozen=1` during
recording so accidental UI clicks cannot alter the registry.

---

## Emergency: TTL Expired Mid-Recording

If a `pool.transact` call fails with a TTL / storage expiry error during
recording:

1. Stop the recording take.
2. Run an emergency TTL bump with a larger value:

```bash
./scripts/preflight.sh pool-ttl-bump --ledgers-to-extend 1000000
```

3. Re-run the full preflight to confirm all checks pass before resuming:

```bash
./scripts/preflight.sh full-check
```

4. Resume the take from the top of the demo script.

---

## Emergency: Facilitator Down

If `preflight.sh full-check` fails on the `/health` check, or the demo hangs
waiting for a settlement response:

1. Check the facilitator terminal for error output.
2. Restart the facilitator:

```bash
cd facilitator && npm run dev
```

3. Wait for the startup log to show the listening port (default 4021).
4. Re-run the full preflight before continuing:

```bash
./scripts/preflight.sh full-check
```

5. If the facilitator log shows XLM balance too low, top up the facilitator
   wallet via friendbot or transfer XLM from the deployer identity.
