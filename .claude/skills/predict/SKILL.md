---
name: predict
description: Run an independent pre-match football scenario analysis for a World Cup 2026 fixture. Takes a fixture name or link. Outputs a locked prediction with scenario, confidence, and market comparison. Logs the record to Google Drive.
disable-model-invocation: false
context: parent
---

# /predict — BKF Locked Prediction Command

Governed by `CLAUDE.md` (the BKF constitution). Obey it. This skill operationalizes the
constitution — it does not override it. **Phase 1 scope:** produce, approve, and log a
locked scenario. Do **not** compute stakes, place bets, generate posts, or trigger
automation.

Agent identity for logging: **DIANA**.

---

## When invoked

1. **Get the fixture.** If the operator did not provide one, ask for the fixture — a name
   (e.g. `Mexico vs England`) or a Sofascore / Betway link. If the home/away split is
   ambiguous (neutral venue), confirm which side is listed first.

2. **Run the independent read.** Run the `football-fixture-prediction` skill
   (**VISION V.X protocol**). Do the analysis from football facts **first** — do not look
   at odds yet.

3. **Generate the scenario** in the locked structure from CLAUDE.md §2:
   1. Baseline Strength
   2. Recent Form Quality
   3. Tactical Matchup
   4. Availability
   5. Context
   6. Independent Probability Estimate (sums to 100%)
   7. Scenario (narrative)
   8. Failure Path
   9. Confidence Level (50–100%)

   Then run the **market comparison** (CLAUDE.md §3) — *after* the read — and record a
   `verdict`: `Market aligns` / `Market contradicts` / `Market underprices`.

4. **Show the full scenario in the chat** — numbered and clear, all nine fields plus the
   market comparison. Run the safety pass (CLAUDE.md §4): strip any forbidden language,
   keep the confidence + failure path, append the Safety Footer for customer-facing text.

5. **Ask:** `Approve this scenario and log to Drive? (yes/no)`

6. **If YES:** format the record as JSON (Level B+2 format below) with a timestamp and
   write it to the `predictions/` folder in Drive
   (`.claude/bkf.config.json` → `drive_folders.predictions`) via the Google Drive
   `create_file` tool (`contentMimeType: application/json`,
   `disableConversionToGoogleType: true`). Then add a row to the **BKF Ledger** sheet.
   Return the Drive link.

7. **If NO:** hold the scenario for revision. Do not log. (Optional: a `status: "held"`
   record may be written for audit, but the ledger row is not added until approval.)

---

## Log Record Format (Level B+2)

```json
{
  "fixture": "England vs DR Congo",
  "date": "2026-07-01",
  "kickoff": "18:00",
  "scenario": {
    "baseline_strength": "...",
    "recent_form": "...",
    "tactical_matchup": "...",
    "availability": "...",
    "context": "...",
    "probability_estimate": { "ENG": 0.70, "Draw": 0.15, "COD": 0.15 },
    "narrative": "...",
    "failure_path": "..."
  },
  "confidence": 65,
  "market_comparison": {
    "market_lean": { "ENG": 0.774, "Draw": 0.157, "COD": 0.069 },
    "verdict": "Market aligns / Market contradicts / Market underprices"
  },
  "spoiler_line": "what spoiled it / what confirmed it",
  "frozen_market_snapshot": {
    "1x2": { "ENG": 1.31, "Draw": 4.50, "COD": 8.00 },
    "timestamp": "2026-07-01T18:00:00Z"
  },
  "logged_at": "ISO timestamp",
  "logged_by": "DIANA"
}
```

### File naming
`YYYY-MM-DD_<home>-vs-<away>_predict-log.json` (kickoff date; teams slugified lowercase).

### Notes
- `probability_estimate` and `market_lean` are decimals that sum to ~1.0.
- `frozen_market_snapshot.1x2` holds decimal odds captured at freeze time; always verify
  odds manually before any decision (Safety Footer).
- After writing, report the Drive `viewUrl` of the log record and the ledger row back to
  the operator.
