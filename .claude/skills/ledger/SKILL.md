---
name: ledger
description: Show the current BKF bankroll — starting balance, available, total exposure, and the last 5 stake records. Read-only; never mutates the ledger.
disable-model-invocation: false
context: parent
---

# /ledger — Bankroll Display (Read-Only)

Governed by `CLAUDE.md`. Phase 2. Displays the current bankroll. **Never writes.**

## Workflow

1. Read the canonical `bankroll.json` (repo root). If it is missing or unreadable, say so
   and stop — do not fabricate a balance.
2. Optionally reconcile against the Drive mirror
   (`.claude/bkf.config.json` → `bankroll.drive_file_id`); if they diverge, flag it and
   treat the local canonical copy as source of truth.
3. Render:

```
BKF BANKROLL — {currency}   (account: {account})
Starting:   R{starting}
Available:  R{available}
Exposure:   R{total_exposure}   ({exposure_pct}% of available)
Cap:        {exposure_cap_pct}% of available per discipline gate

Last 5 stakes:
  {date}  {fixture}  {market}  R{amount_staked} @ {odds}  → {result|open}
  ...
```

4. If there are fewer than 5 records, show all of them. If the ledger is empty, say
   "No stakes logged yet." Append the Safety Footer for any customer-facing rendering.
