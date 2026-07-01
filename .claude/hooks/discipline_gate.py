#!/usr/bin/env python3
"""BKF Phase 2 — PreToolUse discipline gate.

Deterministic, local, fails CLOSED. Reads the PreToolUse event JSON from stdin
and decides allow / ask / deny for two disciplines:

  Exposure gate  — any write to bankroll.json that would push
                   (new_stake + current_exposure) over EXPOSURE_CAP_PCT of the
                   available balance is blocked unless explicitly overridden.

  Approved-scenario gate — a post/publish write to Drive is blocked unless an
                   APPROVED locked scenario exists for the fixture in the local
                   predictions mirror (.claude/bkf.state/predictions/).

The gate never contacts the network. Google Drive writes are performed by the
agent (/livecheck) with MCP access; this hook guards the LOCAL canonical files
and any tool call that would push a stake or a post through.

Output: PreToolUse hookSpecificOutput JSON on stdout (permissionDecision:
allow|ask|deny). On any internal error the gate denies (fail closed).
"""

import json
import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BANKROLL_PATH = os.path.join(REPO_ROOT, "bankroll.json")
PREDICTIONS_DIR = os.path.join(REPO_ROOT, ".claude", "bkf.state", "predictions")
EXPOSURE_CAP_PCT = 30


def decision(kind: str, reason: str) -> None:
    """Emit a PreToolUse decision and exit. kind in {allow, ask, deny}."""
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": kind,
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def load_event() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def tool_text(tool_input: dict) -> str:
    """Flatten the tool payload into a lowercase string for signal matching."""
    try:
        return json.dumps(tool_input).lower()
    except Exception:
        return str(tool_input).lower()


def find_stake_amount(tool_input: dict, blob: str):
    """Best-effort extraction of a proposed stake amount from the tool payload."""
    # Preferred: an explicit BKF marker the /livecheck command embeds in writes.
    for key in ("bkf_stake", "amount_staked", "stake"):
        val = tool_input.get(key) if isinstance(tool_input, dict) else None
        if isinstance(val, (int, float)):
            return float(val)
    # Fallback: parse "amount_staked": N or "stake": N out of the serialized content.
    m = re.search(r'"(?:amount_staked|stake)"\s*:\s*([0-9]+(?:\.[0-9]+)?)', blob)
    if m:
        return float(m.group(1))
    return None


def read_bankroll() -> dict:
    with open(BANKROLL_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def has_approved_scenario(blob: str) -> bool:
    """True if any locally-mirrored prediction is approved and matches the payload."""
    if not os.path.isdir(PREDICTIONS_DIR):
        return False
    for name in os.listdir(PREDICTIONS_DIR):
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(PREDICTIONS_DIR, name), "r", encoding="utf-8") as fh:
                rec = json.load(fh)
        except Exception:
            continue
        status = str(rec.get("status", "")).lower()
        decision_flag = str(rec.get("decision", "")).lower()
        approved = status in ("locked", "approved") or decision_flag == "approved"
        if not approved:
            continue
        fixture = str(rec.get("fixture", "")).lower()
        if fixture and fixture.split(" vs ")[0].strip() and fixture[:12] in blob:
            return True
        # Also accept a slugified fixture match.
        slug = re.sub(r"[^a-z0-9]+", "-", fixture).strip("-")
        if slug and slug[:12] and slug[:12] in re.sub(r"[^a-z0-9]+", "-", blob):
            return True
    return False


def is_bankroll_write(tool_name: str, tool_input: dict, blob: str) -> bool:
    if "bankroll.json" not in blob:
        return False
    write_tools = ("write", "edit", "bash", "create_file", "update")
    return any(t in tool_name.lower() for t in write_tools)


def is_post_write(tool_name: str, blob: str) -> bool:
    # A post/publish is a Drive create/update whose payload signals post/publish/social.
    if "create_file" not in tool_name.lower() and "update" not in tool_name.lower():
        return False
    return any(sig in blob for sig in ('"post"', "/posts/", "publish", "social", "caption"))


def main() -> None:
    try:
        event = load_event()
    except Exception as exc:  # malformed event → fail closed
        decision("deny", f"discipline_gate: unreadable event ({exc}). Blocked (fail closed).")
        return

    tool_name = str(event.get("tool_name", ""))
    tool_input = event.get("tool_input", {}) or {}
    if not isinstance(tool_input, dict):
        tool_input = {"_raw": tool_input}
    # Payloads often carry file bodies as escaped-JSON strings ("\"stake\": 25");
    # unescape so stake/override/post signals match whether nested or top-level.
    blob = tool_text(tool_input).replace('\\"', '"')

    # --- Gate 1: approved-scenario gate for posts ---
    if is_post_write(tool_name, blob):
        if has_approved_scenario(blob):
            decision("allow", "Approved scenario found for fixture. Post write allowed.")
        else:
            decision("deny", "No approved scenario for this fixture. Run `/predict` first, then approve.")
        return

    # --- Gate 2: exposure gate for bankroll writes ---
    if is_bankroll_write(tool_name, tool_input, blob):
        # An explicit operator override flows through untouched.
        if tool_input.get("bkf_override") is True or '"bkf_override": true' in blob:
            decision("allow", "Operator override present. Exposure cap bypassed by explicit approval.")
            return
        stake = find_stake_amount(tool_input, blob)
        if stake is None:
            # No parseable stake (e.g. editing metadata) → allow.
            decision("allow", "Bankroll write with no new stake detected. Allowed.")
            return
        try:
            bank = read_bankroll()
            available = float(bank["balance"]["available"])
            exposure = float(bank["balance"]["total_exposure"])
        except Exception as exc:
            decision("deny", f"discipline_gate: cannot read bankroll.json ({exc}). Blocked (fail closed).")
            return
        cap = (EXPOSURE_CAP_PCT / 100.0) * available
        projected = stake + exposure
        if projected > cap:
            decision(
                "ask",
                (
                    f"Exposure guard: stake R{stake:.2f} + current exposure R{exposure:.2f} "
                    f"= R{projected:.2f} exceeds {EXPOSURE_CAP_PCT}% of available "
                    f"(R{cap:.2f} of R{available:.2f}). Approve anyway? (yes/no)"
                ),
            )
        else:
            decision(
                "allow",
                (
                    f"Within discipline: R{projected:.2f} of R{cap:.2f} cap "
                    f"({EXPOSURE_CAP_PCT}% of R{available:.2f} available)."
                ),
            )
        return

    # Not a gated action → allow.
    decision("allow", "No BKF discipline gate applies to this tool call.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # any unexpected failure → fail closed
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": f"discipline_gate crashed ({exc}). Blocked (fail closed).",
            }
        }))
        sys.exit(0)
