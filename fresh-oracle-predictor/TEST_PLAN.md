# Oracle Vision X — Test Plan

Two layers of testing: **local pure-JavaScript tests** (fast, no Google account
needed) and **Google live tests** (the real Form → Entries → Scoring →
Leaderboard chain).

---

## 1. Local pure-JavaScript tests

Run:

```bash
cd fresh-oracle-predictor
node local-tests.js
```

Expected final output:

```
=== ORACLE VISION X — LOCAL TEST RESULTS ===
PASS: 64
FAIL: 0

All local tests passed. ✅
```

### What is covered

**`normalizeParticipantId`**
- `" @Thato-26 "` → `thato26`
- dashes removed, lowercased, blank/null → `''`

**`parseScore`**
- `6+` → `6`
- `0`–`6` numeric
- negative rejected → `null`
- decimal (`2.5`) rejected → `null`
- text rejected → `null`
- blank / null rejected → `null`

**`calculatePoints`**
- exact result = **3**
- correct winner = **1**
- wrong winner = **0**
- draw predicted + draw happened = **1**; exact draw = **3**
- away-win handling
- `6+` maps to exact
- unparseable input = **0**

**`findOfficialSubmissions` (duplicate rule)**
- earliest timestamp wins the duplicate
- later duplicate → not official
- same id + **different** matches → both official
- same **name** + different id → both separate
- identical timestamps → earlier stored row wins
- out-of-order rows → earliest timestamp still wins (sorting-proof)

**`aggregateLeaderboard` + `sortLeaderboard` (tiebreaks)**
- highest total points ranks first
- exact scores break equal-point ties
- correct results break the next tie
- participant name breaks the final tie
- ranks are sequential (no ties)
- zero-entry / non-eligible participants excluded

**`computeEngineState` (end-to-end)**
- Acceptance 26 — Thato exact 2–4: `Waiting`/0 before, `Eligible`/3 after Final,
  leaderboard row `1 | Thato | 3 | 1 | 0 | 1`
- Acceptance 27/28/29 combined — Lerato 3–1 vs 2–1 = 1; Musa 0–1 vs 2–1 = 0
  (still eligible); duplicate Lerato entry = `Duplicate - Not Scored`, 0 pts,
  excluded from leaderboard
- same id across two matches accumulates (6 pts, 2 entries)
- case-insensitive `FINAL` still scores

---

## 2. Google live tests

Deploy per `DEPLOYMENT.md`, then run these against the live spreadsheet + form.

### LIVE-0 — System check
Run `runLiveSystemCheck()`. Expect all ✅: Script Properties present, spreadsheet
and form open, all four sheets exist, active match `TEST-01` found, both triggers
installed.

### LIVE-1 — First-live-test (exact score) — the success condition
1. Ensure Matches row `TEST-01` = Blue Team vs Red Team, Status `Open`.
2. Open the **Public Form URL** and submit:
   - Predictor name: `Thato`
   - Unique player ID: `final-test-01`
   - Blue Team goals: `2`  ·  Red Team goals: `4`
   - Who scores first: `Blue Team`  ·  Confidence: `3`
3. **Expect (before result):** a new Entries row with Eligibility
   `Waiting for result`, Points `0`.
4. In Matches, set `Actual Home = 2`, `Actual Away = 4`, `Status = Final`.
5. **Expect automatically:**
   - Entries row → Eligibility `Eligible`, Points `3`
   - Leaderboard → `1 | Thato | 3 | 1 | 0 | 1`

This is the end-to-end success condition. Nothing less counts.

### LIVE-2 — Correct result
Add participant `Lerato`, prediction `3–1`, against actual `2–1`.
**Expect:** Eligibility `Eligible`, Points `1`.

### LIVE-3 — Wrong result
Add participant `Musa`, prediction `0–1`, against actual `2–1`.
**Expect:** Eligibility `Eligible`, Points `0` (appears on leaderboard with 0).

### LIVE-4 — Duplicate
Submit twice with the **same** Unique ID and Match ID:
first `2–1`, then `5–0`.
**Expect:** first row official; second row `Duplicate - Not Scored`, `0` pts, and
absent from the leaderboard.

### LIVE-5 — Leaderboard ordering
With the participants above scored, verify:
- A. highest total points ranks first
- B. exact scores break equal-point ties
- C. correct results break the next tie
- D. participant name breaks the final tie
- E. ranks are sequential
- F. zero-entry people do not appear (people with counted 0-point entries still
  appear; people with no eligible entry do not)

### LIVE-6 — Open / Close
- Run `closeEntries()`. Submit a new prediction → its Eligibility becomes
  `Match Closed` and it does not become official.
- Run `openEntries()` → submissions become official again.

### LIVE-7 — Repair
Run `repairExistingSystem()`. Expect: sheets/headers ensured, both triggers
reinstalled, Control refreshed, no data lost, leaderboard rebuilt — all using IDs
from Script Properties (no hardcoded ID).
