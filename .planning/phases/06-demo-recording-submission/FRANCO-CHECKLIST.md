# Phase 6 — Franco Checklist

Everything the agent could do is done. What remains is **physically irreducible to a human**: recording narration into a microphone, uploading to YouTube, clicking Publish on DoraHacks. This file lists those steps in execution order, each paired with the exact text to paste and the one command to run after.

Run in this order. Each item is a bounded session; do not mix them.

---

## ☐ 1. Day-5 rehearsal recording — 2026-04-15 AM

**Goal:** insurance-policy backup MP4 in the can. If Day 6 collapses, this is what you submit.

### Pre-record routine

1. ```bash
   cd /Users/francoperez/repos/stellar-projects/stellar-enclave
   ./scripts/preflight.sh pool-ttl-bump
   ```
2. Build and start the facilitator so preflight's `/health` + `float` checks go green:
   ```bash
   npm run build -w @enclave/facilitator
   npm -w @enclave/facilitator start   # leave running in its own terminal
   export REGISTRY_FROZEN=1
   ```
3. Run the recording gate (the only gate):
   ```bash
   ./scripts/preflight.sh full-check ; echo "exit=$?"
   ```
   Must exit 0. Fix anything red before rolling.
4. Sanity grep (one line):
   ```bash
   ./scripts/check-claim-hygiene.sh
   ```

### OBS stage

- Scene 1 "Demo Pantalla": OBS Window Capture of demo browser (Stellar Expert tabs + demo endpoint terminal + facilitator logs) + small-PiP Continuity Camera.
- Scene 2 "Talking head only": Continuity Camera full-frame (0:00-0:08 hook + 2:25-2:45 close).
- Audio: HyperX mic only. Mute MacBook built-in mic.
- Two Stellar Expert tabs staged: (a) a real testnet `pool.transact` tx hash from recent facilitator settlement, (b) the USDC Payment op.

### Roll (≤3 min take)

- Narrate `.planning/hackathon/DEMO-SCRIPT.md` v4 lines 21-113 from memory. Do NOT edit the script during rehearsal.
- Mid-take failure protocol: switch to fixture replay via `ENCLAVE_FIXTURE_PATH=demo/fixtures/<url>.json`. Last successful Stellar Expert tab stays on screen. Keep narrating. Only stop if OBS/CapCut itself crashes.

### Post-record

```bash
mkdir -p demo/backups
cp "/path/to/OBS/output.mp4" demo/backups/day-5-rehearsal.mp4

{
  echo "recorded_at: $(date -Iseconds)"
  echo "preflight_exit_code: 0"
  echo "---"
  ffprobe -v error -show_entries format=duration,size,bit_rate \
    -show_entries stream=codec_name,width,height,r_frame_rate \
    demo/backups/day-5-rehearsal.mp4
  echo "---"
  echo "duration_human: $(ffprobe -v error -show_entries format=duration \
    -of default=nw=1:nk=1 demo/backups/day-5-rehearsal.mp4 \
    | awk '{m=int($1/60); s=$1-m*60; printf "%d:%05.2f\n", m, s}')"
  echo "mid_take_fallback_taken: no"
} > demo/backups/day-5-rehearsal-meta.txt

git add demo/backups/day-5-rehearsal.mp4 demo/backups/day-5-rehearsal-meta.txt
git commit -m "feat(06-02): Day 5 rehearsal MP4 + metadata (DEMO-05 insurance)"
```

**Duration must be 60 ≤ N ≤ 210 seconds.** MP4 goes up to ~250 MB for 2:45 @ 12 Mbps — fine, no git-lfs.

---

## ☐ 2. DoraHacks writeup draft review — 2026-04-15 PM

The agent already drafted `.planning/hackathon/DORAHACKS-WRITEUP.md`. Review it once with the rehearsal's emotional signal hot.

- Read through: Franco opener, PAS arc, contracts table, honest-scope section.
- Check: no stale claims, video URL slot present, repo URL slot present.
- If you want to edit a paragraph, do it now — not on Day 7.
- Do NOT touch `DEMO-SCRIPT.md` (baseline locks must not drift).

No commit needed for the review pass.

---

## ☐ 3. Day-6 final recording + CapCut edit — 2026-04-16 AM

**Same pre-record routine as Day 5** (TTL bump, `npm run build -w @enclave/facilitator`, facilitator start, `REGISTRY_FROZEN=1`, `preflight.sh full-check` exit 0, claim-hygiene check).

- Re-read DEMO-SCRIPT.md cold once to catch drift.
- Re-read the 1:35-1:37 sacred silence beat in `SOUND-MAP.md`.

Record in OBS — single take, per-PAS-block takes, or hybrid — your call on the day.

CapCut editing pass:
- Trim dead air.
- Overlay sound cues per SOUND-MAP.md (whoosh, success chime, buzz, 2s silence over Stellar Expert hash).
- Auto-captions enabled.
- 3-second end card: wordmark + "Shielded organizations for agentic commerce" + repo URL + DoraHacks URL (placeholder "coming soon" is OK; URL lands on Day 7).
- Optional: sound bed at 15-20 % under dialogue.

Export: MP4 (H.264 + AAC), 1920×1080, 30 fps, CapCut "Recommended" bitrate.

Post-edit:
```bash
mkdir -p demo/final
cp "/path/to/capcut/export.mp4" demo/final/day-6-final.mp4

{
  echo "recorded_at: $(date -Iseconds)"
  echo "preflight_exit_code: 0"
  echo "take_strategy: single|per-PAS-block|hybrid"
  echo "mid_take_fallback_taken: no"
  echo "capcut_export_settings: 1080p30 H.264 + AAC, bitrate ~XX Mbps"
  echo "captions: capcut-auto"
  echo "end_card_duration_s: 3"
  echo "---"
  ffprobe -v error -show_entries format=duration,size,bit_rate \
    -show_entries stream=codec_name,width,height,r_frame_rate \
    demo/final/day-6-final.mp4
  echo "---"
  echo "duration_human: $(ffprobe -v error -show_entries format=duration \
    -of default=nw=1:nk=1 demo/final/day-6-final.mp4 \
    | awk '{m=int($1/60); s=$1-m*60; printf "%d:%05.2f\n", m, s}')"
  echo "youtube_url: PENDING"
} > demo/final/day-6-final-meta.txt

git add demo/final/day-6-final.mp4 demo/final/day-6-final-meta.txt
git commit -m "feat(06-03): Day 6 final recording + CapCut export"
```

**Duration must be 60 ≤ N ≤ 180 seconds** (DEMO-02 "≤3 min" ceiling).

**Fallback:** if Day 6 take doesn't land, use `demo/backups/day-5-rehearsal.mp4` and add `fallback_to_day5_rehearsal: true` to the meta file. ROADMAP §"Cut decision" authorizes it.

---

## ☐ 4. YouTube upload (unlisted) — 2026-04-16 PM

Open `demo/final/YOUTUBE-UPLOAD.txt`. Everything is pre-written.

- https://studio.youtube.com → Upload `demo/final/day-6-final.mp4`
- Copy TITLE from YOUTUBE-UPLOAD.txt
- Copy DESCRIPTION from YOUTUBE-UPLOAD.txt
- **Visibility: UNLISTED** (not Public, not Private)
- Category: Science & Technology
- Language: English
- Publish → copy the resulting URL

Sanity-check: open an incognito window, paste the URL, confirm playback.

Then, one command:
```bash
./scripts/substitute-video-url.sh "https://www.youtube.com/watch?v=XXXXXXXXXXX"
```

That replaces `<!-- VIDEO_URL -->` in README + DoraHacks draft, updates `day-6-final-meta.txt` `youtube_url:` line, re-runs DEMO-06 grep, and commits. Done.

---

## ☐ 5. Final preflight (live testnet) — 2026-04-17 AM or submission PM

Facilitator must be running with real USDC + XLM floats. Then:

```bash
./scripts/run-final-preflight.sh
```

Expect: **✓ Preflight PASSED**. Log lands at `.planning/phases/06-demo-recording-submission/06-04-FINAL-PREFLIGHT.log` — the DEMO-03 evidence juror-inspection artifact.

If any check fails, the script prints common fixes. Re-run until exit 0.

---

## ☐ 6. Claim-hygiene last check

```bash
./scripts/check-claim-hygiene.sh
```

Expect: **✓ claim-hygiene CLEAN**. If the table shows any FAIL, fix the offending file before publishing.

---

## ☐ 7. DoraHacks publish — 2026-04-17 before 23:59 local (HARD DEADLINE)

Open `.planning/hackathon/DORAHACKS-FORM.md`. Every form field is pre-written.

- https://dorahacks.io/hackathon/stellar-agents-x402-stripe-mpp/ → Submit
- Paste TITLE, SUBTITLE, REPO URL, VIDEO URL, WRITEUP BODY from DORAHACKS-FORM.md
- Pre-publish visual sanity: Franco opener is first paragraph, lock phrase in first two paragraphs, all four contract IDs present, YouTube URL clickable.
- Click Publish. Copy the resulting URL.

Then, one command:
```bash
./scripts/substitute-dorahacks-url.sh "https://dorahacks.io/buidl/XXXXXX"
```

That replaces `<!-- DORAHACKS_URL -->` in README + DoraHacks draft, re-runs claim-hygiene check, commits, and pushes.

**Phase 6 closed.**

---

## If something breaks

- **Preflight fails** — build and start facilitator (`npm run build -w @enclave/facilitator && npm -w @enclave/facilitator start`), seed USDC float, bump TTL, re-run.
- **Day-6 take doesn't land** — fall back to Day-5 rehearsal (update meta `fallback_to_day5_rehearsal: true`).
- **YouTube URL wrong** — manually `git revert` the VIDEO_URL commit, re-run `substitute-video-url.sh` with the right URL.
- **DoraHacks late** — ROADMAP is explicit: imperfect submission > perfect miss. Ship whatever's ready at 23:58.

---

## One-screen summary

1. 2026-04-15 AM — Day-5 rehearsal MP4 recorded, committed to `demo/backups/`.
2. 2026-04-15 PM — DoraHacks draft reviewed (already drafted by agent).
3. 2026-04-16 AM — Day-6 final recorded + CapCut export, committed to `demo/final/`.
4. 2026-04-16 PM — YouTube upload (unlisted) → `scripts/substitute-video-url.sh <url>`.
5. 2026-04-17 AM — `scripts/run-final-preflight.sh` exit 0.
6. 2026-04-17 PM — `scripts/check-claim-hygiene.sh` → `✓`.
7. 2026-04-17 before 23:59 — DoraHacks publish → `scripts/substitute-dorahacks-url.sh <url>`.

Done.
