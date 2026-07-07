# Oracle Vision X — Live Predictor Engine

A reusable, white-label football predictor engine built as **one standalone
Google Apps Script project**. Followers predict a scoreline, the engine scores
every prediction automatically, and a leaderboard is rebuilt on its own — turning
one-off "predict the score" posts into a managed, recurring competition.

```
Page posts link → Follower predicts → Entry stored automatically
→ Duplicate rule applied → Match goes Final → Every entry scored
→ Leaderboard rebuilt → Page posts leaderboard
```

The operator only ever does two things: set the match Open before kick-off, and
enter the final score + set the match to `Final` afterwards. Everything else is
automatic.

---

## Architecture

**One core principle: the Apps Script owns all logic.** Google Sheets are only
storage, the operator interface, and the public output. There are **no
spreadsheet formulas** anywhere for scoring, duplicate detection, aggregation,
ranking, or sorting. Every value in the sheets is a plain value written by the
script, so the system survives sheet sorting, copied tabs, and Google
recalculation quirks.

### Single source of truth

`buildFreshOraclePredictor()` creates the entire system from zero:

1. one Google Spreadsheet (`Oracle Vision X — Live Predictor Engine`)
2. one Google Form (the creative predictor)
3. one Form-submit trigger → `handleOracleFormSubmit`
4. one spreadsheet edit trigger → `handleOracleMatchEdit`

The generated Spreadsheet ID and Form ID are stored in **Script Properties**
(`ORACLE_SPREADSHEET_ID`, `ORACLE_FORM_ID`) and mirrored into the Control sheet.
**No ID is ever hardcoded in the source.** Every later function reads the IDs
back from Script Properties; if they are missing it throws:

> `System ID missing. Run buildFreshOraclePredictor once.`

---

## Sheets

| Sheet | Purpose | Columns |
|-------|---------|---------|
| **Control** | Operator dashboard & system reference (`Field \| Value`) | Spreadsheet ID, Spreadsheet URL, Form ID, Public Form URL, Edit Form URL, Active Match ID, Page Name, System Status, Created Time, Last Refresh Time, Last Refresh Result |
| **Matches** | The fixtures + results the operator manages | A Match ID · B Home Team · C Away Team · D Entry Close · E Actual Home · F Actual Away · G Status |
| **Entries** | Every submission, one row each (plain values) | A Timestamp · B Participant Name · C Unique ID · D Match ID · E Home Prediction · F Away Prediction · G First Scorer · H Confidence · I Eligibility · J Points |
| **Leaderboard** | Public standings (rebuilt every refresh) | A Rank · B Participant Name · C Total Points · D Exact Scores · E Correct Results · F Entries |

Match statuses: **Open** (accepting entries) · **Closed** (no new official
entries) · **Final** (result known, entries scored). Status matching is
case-insensitive internally.

---

## Scoring

Only **official** entries are scored, and only when the match Status is `Final`.

| Outcome | Points |
|---------|--------|
| Exact score (e.g. predict 2–1, actual 2–1) | **3** |
| Correct result — right winner or right draw | **1** |
| Wrong result | **0** |

Result category is `Home win` / `Draw` / `Away win`. Scores come from a dropdown
`0,1,2,3,4,5,6+`; `6+` maps to numeric `6`.

---

## Unique identity & the duplicate rule

Each participant gets an internal **normalized key**: the Unique ID is converted
to a string, trimmed, lowercased, and stripped to `a–z0–9` only
(`" @Thato-26 "` → `thato26`). Participant Name is used only as a fallback. The
normalized key is never shown publicly.

For the same **normalized Unique ID + Match ID**, only the **earliest
submission** (by Timestamp) is official. Later ones stay visible in Entries but
are marked `Duplicate - Not Scored` and score 0. Ties on identical timestamps go
to the earlier stored row. **Sorting the sheet never changes which prediction is
official** — the winner is chosen by timestamp, not row order.

Eligibility states: `Waiting for result` · `Eligible` ·
`Duplicate - Not Scored` · `Match Closed` · `Invalid Entry`.

---

## Leaderboard aggregation

Only entries with Eligibility `Eligible` count. Standings are aggregated by
normalized identity, then sorted:

1. Total Points ↓
2. Exact Scores ↓
3. Correct Results ↓
4. Participant Name ↑

Ranks are sequential (`1,2,3,…`) — never tied. Participants with zero counted
entries do not appear.

---

## Triggers

Installed by the build (and re-installable via `repairExistingSystem()`), with
old duplicates for the same handler removed first:

| Trigger | Handler | Fires on |
|---------|---------|----------|
| Form submit | `handleOracleFormSubmit` | a follower submits the Form |
| Spreadsheet edit | `handleOracleMatchEdit` | operator edits Matches col E/F/G |

Both recompute duplicates → scoring → leaderboard automatically. The operator
never has to run a function by hand after entering a result.

---

## Public functions

| Function | Purpose |
|----------|---------|
| `buildFreshOraclePredictor()` | Create the entire system from zero. Run once. |
| `rebuildCreativeForm()` | Rebuild the Form for the current active match without rebuilding the engine. |
| `openEntries()` | Set the active match/system to **Open**. |
| `closeEntries()` | Set the active match/system to **Closed**. |
| `refreshEverything()` | Recalculate duplicates, scoring, and leaderboard. |
| `runLiveSystemCheck()` | Return a clear diagnostic report of the whole system. |
| `repairExistingSystem()` | Repair a system built by this architecture (IDs from Script Properties, never hardcoded). |

---

## Local tests

The pure logic (`normalizeParticipantId`, `parseScore`, `calculatePoints`,
`findOfficialSubmissions`, `aggregateLeaderboard`, `sortLeaderboard`,
`computeEngineState`) is exported for Node at the bottom of `Code.gs` behind a
`module.exports` guard that Apps Script ignores. Run:

```bash
node local-tests.js
```

See `TEST_PLAN.md` for the full list of local and live tests with expected
outcomes, and `DEPLOYMENT.md` for the five-step Google setup.
