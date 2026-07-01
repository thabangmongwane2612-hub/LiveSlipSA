# CLAUDE.md — Before Kickoff Football (BKF) Constitution

> This file is the **locked methodology constitution** for Before Kickoff Football (BKF),
> a pre-match football scenario analysis operation. It governs how every prediction,
> scenario, and piece of content is produced. Rules here are **non-negotiable** unless
> explicitly changed by the operator in a new locked version of this file.
>
> **Phase:** 1 (scaffold). Bankroll management, post generation, and automation are
> **out of scope** and must not be built or invoked yet.

---

## 1. BKF Core Methodology — "Read the game before kickoff"

1. **Independent analysis FIRST, then market comparison.**
   Form your own read of the fixture before you ever look at the odds. The market is
   consulted *after* the scenario is locked — never before, never during.
2. **Scenario drives the bet, not odds.**
   The narrative of what will happen on the pitch is the product. Odds are a
   second-order input used only to locate value against the read.
3. **The pre-match scenario is the gate.**
   No fixture is actioned without a locked prediction. If there is no scenario, there
   is no bet. Full stop.
4. **No chalk plays without a reason.**
   Backing the favourite ("chalk") is only allowed when the analysis surfaces a genuine
   **edge** — a concrete reason grounded in facts. An edge is a read, not a guess.

---

## 2. Scenario Structure (LOCKED FORMAT)

Every prediction produced by BKF **must** output all of the following fields, in this
order. Missing any field means the prediction is invalid and the fixture stays ungated.

1. **Baseline Strength** — form, squad quality, and availability at a structural level.
2. **Recent Form Quality** — not just results, but the *quality* of recent performances.
3. **Tactical Matchup** — how the two sides' styles and shapes interact.
4. **Availability** — injuries, suspensions, rotation, and other team-news context.
5. **Context** — tournament stage, pressure, momentum, motivation, stakes.
6. **Independent Probability Estimate** — explicit probabilities for each outcome that
   sum to 100%. Example format: `England 70% / Draw 15% / Congo 15%`.
7. **Scenario** — the narrative: what most likely happens on the pitch.
8. **Failure Path** — what breaks the read; the concrete conditions under which the
   scenario is wrong.
9. **Confidence Level** — a value from **50% to 100%** expressing conviction in the read.

---

## 3. Market Philosophy

- Markets show **WHERE the crowd is leaning**, not what *will* happen.
- Compare the read to the market **only after** the independent analysis is locked.
- **If the market aligns with the facts:** confirm the read.
- **If the market contradicts the facts:** flag the **edge** — the odds are showing you
  the bet.
- The market is a mirror of crowd sentiment, not a source of truth. Treat it as
  evidence about other people, not about the match.

---

## 4. Safety Rules (NON-NEGOTIABLE)

- **18+ only** on all public content.
- **Stake amounts are hidden.** Customers place their own bets and choose their own
  stakes. BKF never instructs a specific stake amount.
- **Never claim certainty.** Every read carries a confidence level and a failure path.
- **Always frame outcomes as football outcomes** — football wins or football loses.

### Never say (FORBIDDEN LANGUAGE)
These phrases are banned from all BKF output, public or internal-facing:

`guaranteed win` · `sure odds` · `sure bet` · `banker` · `fixed odds` ·
`cannot lose` · `AI never fails` · `pay to win` · `recover your losses` ·
`VIP group` · `easy money` · `locked in`

### Always say
- "model scenario"
- "confidence level"
- "failure path"
- "football can win or lose"

### Safety Footer (append to all public content)
> 18+. Scenario analysis is not certainty. Football can win or lose. Verify odds and
> markets manually before any decision. Bet responsibly.

---

## 5. RCIS Framework — Relief-to-Identity Conversion Scale (Psychology)

All customer-facing content **must score ≥ 38 / 50** on the RCIS. Each of the six
dimensions below is scored, and the total is checked before anything ships.

| # | Dimension | What it does |
|---|-----------|--------------|
| 1 | **Fear Mirror** | Name the private doubt the buyer already feels. |
| 2 | **Identity Upgrade** | Show the alternative version of the buyer. |
| 3 | **Process Proof** | Show the method — the read, not just the pick. |
| 4 | **Curiosity Gap** | Name what's hidden (the paid product) without revealing it. |
| 5 | **Low-Pressure CTA** | Make the next step easy and non-coercive. |
| 6 | **Safety Lock** | 18+ / not guaranteed / bet responsibly. |

Content scoring **below 38/50 does not ship.** The Safety Lock dimension (#6) is
mandatory regardless of total score — content missing it fails outright.

---

## 6. The /predict Command

The `/predict` slash command is the only sanctioned way to produce a locked prediction.
It wraps the `football-fixture-prediction` skill, enforces the locked Scenario Structure
(Section 2), applies the Market Philosophy (Section 3) *after* the independent read, and
writes a structured log record to Google Drive for every execution (see
`.claude/skills/predict/SKILL.md`).

**Rule:** a fixture is only "gated" — eligible to be actioned in later phases — once
`/predict` has produced a complete, logged scenario for it.

---

## 7. Drive Structure (Phase 1)

All BKF artifacts live under the Google Drive folder **`live slip essay`**:

```
live slip essay/
├── fixtures/       # raw fixture inputs (teams, kickoff, competition, context)
├── predictions/    # locked scenarios produced by /predict
├── results/        # actual match outcomes (for later grading)
└── calibration/    # prediction-vs-result tracking to measure model calibration
```

Folder IDs are recorded in `.claude/bkf.config.json`.

---

## 8. Scope Guard (Phase 1)

**In scope:** this constitution, the `/predict` command, the Drive folder structure,
and the per-execution logging mechanism.

**Out of scope (do NOT build yet):** bankroll management, staking systems, automated
posting, social content generation, scheduling/automation, and any public distribution.
