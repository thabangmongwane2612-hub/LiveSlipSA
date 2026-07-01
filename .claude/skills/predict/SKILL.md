---
name: predict
description: >-
  Produce a locked BKF pre-match scenario for a football fixture. Wraps the
  football-fixture-prediction skill, enforces the locked Scenario Structure from
  CLAUDE.md (independent read FIRST, market comparison AFTER), and writes a
  structured log record to Google Drive on every execution. Use when the operator
  asks to predict, read, or gate a fixture (e.g. "/predict England vs Congo").
---

# /predict — BKF Locked Prediction Command

This command is the **only** sanctioned way to produce a locked BKF prediction. It is
governed by `CLAUDE.md` (the BKF constitution). Read and obey that file. This skill
does not override it — it operationalizes it.

**Phase 1 scope:** produce and log a locked scenario. Do **not** compute stakes, place
bets, generate posts, or trigger automation.

---

## Inputs

The operator supplies a fixture, minimally:

- **Home team** and **Away team**
- **Competition** (league / tournament and stage)
- **Kickoff** date/time
- Optional **context** notes (team news, motivation, venue, etc.)

If the home/away split is ambiguous (e.g. a neutral-venue final), ask which side is
listed first; do not guess.

---

## Procedure (STRICT ORDER)

### Step 1 — Independent analysis FIRST (no odds yet)
Do **not** look at, mention, or reason from the market in this step. Build the read from
football facts only. Produce the **locked Scenario Structure** exactly as specified in
CLAUDE.md §2, all fields present and in order:

1. **Baseline Strength** — form, squad quality, availability (structural).
2. **Recent Form Quality** — quality of recent performances, not just results.
3. **Tactical Matchup** — how the styles and shapes interact.
4. **Availability** — injuries, suspensions, rotation, team news.
5. **Context** — tournament stage, pressure, momentum, stakes.
6. **Independent Probability Estimate** — outcome probabilities that sum to 100%
   (e.g. `England 70% / Draw 15% / Congo 15%`).
7. **Scenario** — the narrative of what most likely happens on the pitch.
8. **Failure Path** — the concrete conditions under which the read is wrong.
9. **Confidence Level** — 50%–100%.

If any field cannot be completed, the prediction is **invalid** — say so and stop. The
fixture stays ungated.

### Step 2 — Market comparison AFTER
Only now consult the market. Compare the locked read to the odds:

- **Aligns with the facts →** confirm the read.
- **Contradicts the facts →** flag the **edge** (the odds show the bet).

Record the market snapshot and the verdict (`confirm` | `edge`). Never let the market
rewrite Step 1 — if new *football* information surfaces, that is a new read, not a market
adjustment.

### Step 3 — Safety pass
Enforce CLAUDE.md §4 before anything is presented or logged:

- Scan output for **forbidden language**; if any appears, rewrite to remove it.
- Ensure the read is framed with a confidence level and a failure path.
- If the output is customer-facing, append the **Safety Footer** and confirm the content
  scores **≥ 38/50** on the RCIS (CLAUDE.md §5), with the Safety Lock dimension present.

### Step 4 — Log to Drive (EVERY execution)
Write a structured log record to Drive on **every** `/predict` run — including invalid or
aborted ones (log the reason). See the Logging section below.

---

## Logging Mechanism (writes to Google Drive)

Every execution writes **one JSON log record** to the `predictions` folder in Drive
(folder id in `.claude/bkf.config.json` → `drive.folders.predictions.id`), using the
Google Drive `create_file` tool.

- **Parent:** `drive.folders.predictions.id`
- **Title:** `YYYY-MM-DD_<home>-vs-<away>_predict-log.json` (kickoff date, teams
  slugified lowercase).
- **contentMimeType:** `application/json`, with `disableConversionToGoogleType: true`.

### Log record schema

```json
{
  "timestamp": "2026-07-01T18:40:00Z",
  "command": "/predict",
  "status": "locked | invalid",
  "fixture": {
    "home": "England",
    "away": "Congo",
    "competition": "Friendly",
    "stage": "N/A",
    "kickoff": "2026-07-05T19:00:00Z"
  },
  "scenario": {
    "baseline_strength": "...",
    "recent_form_quality": "...",
    "tactical_matchup": "...",
    "availability": "...",
    "context": "...",
    "independent_probability_estimate": { "England": 70, "Draw": 15, "Congo": 15 },
    "scenario": "...",
    "failure_path": "...",
    "confidence_level": 72
  },
  "market": {
    "consulted": true,
    "snapshot": "England 1.45 / Draw 4.20 / Congo 6.50",
    "verdict": "confirm | edge",
    "edge_note": "..."
  },
  "safety": {
    "forbidden_language_found": false,
    "footer_applied": true,
    "rcis_score": 41
  },
  "gated": true
}
```

Notes:
- `gated` is `true` only when a complete, valid locked scenario was produced.
- On an invalid run, set `status: "invalid"`, `gated: false`, and include a
  `"reason"` field explaining what was missing; still write the log record.
- After writing, report the Drive `viewUrl` of the log record back to the operator.

---

## Output to the operator

1. The locked Scenario Structure (all 9 fields).
2. The market verdict (`confirm` / `edge`) with a one-line justification.
3. Confirmation that the log record was written, with its Drive link.
