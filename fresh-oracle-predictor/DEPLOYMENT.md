# Oracle Vision X — Deployment

Google setup is reduced to five steps. No spreadsheet formulas, no manual
Form-to-Sheet linking, no hardcoded IDs.

---

## Deploy in 5 steps

1. **Create one standalone Apps Script project.**
   Go to <https://script.google.com> → **New project**. (Standalone, *not*
   bound to an existing sheet.)

2. **Paste the complete `Code.gs`.**
   Delete any existing code in the editor, paste the entire contents of
   `Code.gs`, and **Save**.

3. **Run `buildFreshOraclePredictor()`.**
   Select `buildFreshOraclePredictor` in the function dropdown → **Run**.
   Approve the authorization prompt the first time (it needs Sheets, Forms,
   Drive, and Script/trigger access). This creates the spreadsheet, the form,
   both triggers, seeds the `TEST-01` match, and stores the IDs in Script
   Properties.

4. **Open the generated Control sheet.**
   In the execution log (**View → Logs**) you'll see the Spreadsheet URL and the
   Public Form URL. Open the spreadsheet — the **Control** tab lists every ID and
   URL for reference.

5. **Use the Public Form URL.**
   Share that link with followers. Submissions flow straight into the engine.

Verify anytime by running `runLiveSystemCheck()` — it prints a ✅/❌ report.

---

## Everyday operation

**Before a match**
1. In the **Matches** sheet set Match ID, Home Team, Away Team (edit row
   `TEST-01`, or add a new row and set that Match ID in Control → `Active Match ID`).
2. Run `rebuildCreativeForm()` so the Form's questions use the new team names,
   then run `openEntries()` (or set Status to `Open`).
3. Post the **Public Form URL**.

**After the match**
1. In **Matches**, enter `Actual Home`, `Actual Away`.
2. Set `Status` to `Final`.

That's it — the edit trigger rescoring every entry and rebuilds the Leaderboard
automatically. Post the Leaderboard tab as your content.

---

## Managing multiple matches / a new instance

- **New match, same instance:** add a Matches row, set Control → `Active Match ID`
  to it, run `rebuildCreativeForm()`, then `openEntries()`.
- **A whole new customer instance:** repeat the 5-step deploy in a fresh Apps
  Script project. Each instance owns its own spreadsheet, form, and Script
  Properties — nothing is shared or hardcoded. Set Control → `Page Name` to the
  customer's brand. (A single-call `buildCustomerPredictor(config)` is a Phase-2
  convenience, not required for the MVP.)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `System ID missing. Run buildFreshOraclePredictor once.` | The Script Properties were cleared or you're in a different project. Run `buildFreshOraclePredictor()` (new system) or `repairExistingSystem()` (existing one). |
| Results entered but leaderboard didn't update | Run `refreshEverything()`. Confirm the edit trigger exists via `runLiveSystemCheck()`; `repairExistingSystem()` reinstalls it. |
| Form shows old team names | Run `rebuildCreativeForm()` after updating the Matches row. |
| Duplicate triggers | Re-running the build/repair deletes old triggers for the same handler first, so duplicates are prevented automatically. |
