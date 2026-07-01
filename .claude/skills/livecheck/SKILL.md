---
name: livecheck
description: Check if a live market aligns with the pre-match scenario. Input: fixture name or market link. Output: scenario alignment verdict + edge assessment (match / contradict / flag edge). Reads the pre-match prediction from Drive, compares to live market, returns cold read. Logs an approved stake to the bankroll.
disable-model-invocation: false
context: parent
---

# /livecheck — Live Market Alignment (Cold Read)

Governed by `CLAUDE.md`. Phase 2. This command **verifies** a live market against the
locked pre-match scenario — it never overrides the scenario. Its default posture is
caution: cold read, no chase, exposure-capped. Never instruct a stake amount.

Agent identity for logging: **DIANA**.

---

## Workflow

1. **Get the input.** Ask for a **fixture name** OR a **market link / screenshot** if not
   provided. Confirm the fixture if ambiguous.

2. **Load the pre-match read.** Find the fixture's prediction in Drive `predictions/`
   (`.claude/bkf.config.json` → `drive_folders.predictions`) by querying the log records
   for the fixture name. Pull `probability_estimate` and `confidence`. If no locked
   prediction exists, **stop** — "No scenario for this fixture. Run `/predict` first."

3. **Parse the live market.** Read the odds and market type from the input (e.g.
   `1X2 England @ 1.60`). Convert decimal odds → implied probability
   (`implied = 1 / odds`, then note the overround across outcomes).

4. **Compare read vs market:**
   - Market lean ≈ scenario probability → **ALIGN**
   - Market clearly diverges (e.g. market 60% vs scenario 50%) → **CONTRADICT**
   - Odds price value the scenario says exists → **EDGE**
   Compute fair-value odds for the scenario probability (`fair = 1 / p`) and compare to
   the offered odds to judge whether there is genuine value.

5. **Output (structured, cold):**
   ```
   Fixture:        Mexico vs England R16
   Market:         1X2 England @ 1.60
   Pre-match read: England 50% (confidence 62%)
   Market lean:    England ~60%

   VERDICT: Market overprices England slightly. Your read says 50%; market assumes 60%.
     - If you believe 50%: fair value ~1.90 → 1.60 offers NO edge (you'd be underpaid).
     - If the market's 60% is right: your scenario misread the edge.

   RECOMMENDATION: Cold read only. No override. Verify the scenario before staking.
   ```
   Append the Safety Footer for any customer-facing text.

6. **Ask:** `Approve this read and log to bankroll? (yes/no)`

7. **If YES → log the stake.** Append a record to the local canonical `bankroll.json`
   (repo root) and update `balance`, then write the synced mirror to Drive
   (`live slip essay/bankroll.json`). The **PreToolUse discipline gate** runs first and
   will block/ask if `new_stake + current_exposure` exceeds 30% of `available`. Include
   `"amount_staked": <n>` in the write so the gate can read the stake. To knowingly
   breach the cap, set `"bkf_override": true` only after explicit operator yes.

   **If NO →** hold. Log nothing.

---

## Stake record (appended to `bankroll.json` → `ledger[]`)

```json
{
  "id": "2026-07-07-MEX-ENG-001",
  "fixture": "Mexico vs England R16",
  "date": "2026-07-07",
  "market": "1X2 England",
  "scenario_confidence": 62,
  "recommendation": { "stake": 25, "odds": 1.60 },
  "decision": "approved",
  "live_check_verdict": "market aligns with scenario",
  "amount_staked": 25,
  "result": null,
  "timestamp": "ISO timestamp"
}
```

After writing, update `balance`:
`staked_current += amount_staked`, `total_exposure += amount_staked`,
`available = starting − total_exposure`, and `metadata.last_updated = now`. Report:
`Logged. New balance: R{available} | Exposure: R{total_exposure}`.
