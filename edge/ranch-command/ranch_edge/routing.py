"""Alert routing, mirroring public/ranch-command/js/events.js line for line.

Both read the same rules.json and both are tested against the same fixture
file (tests/ranch-command/fixtures/routing.json), so a detection is routed
the same way on the edge box as in the browser. Standard library only.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any


def load_rules(path: str | Path) -> dict[str, Any]:
    """Read a rules file."""
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def kind_of(label: str, rules: dict[str, Any]) -> str:
    """The kind a detector label belongs to, or ``unknown``."""
    key = re.sub(r"[\s-]+", "_", str(label or "").lower().strip())
    return rules["classes"].get(key, "unknown")


def is_night(hour: int, night: dict[str, int]) -> bool:
    """Whether an hour counts as night; the window may wrap midnight."""
    if night["start"] > night["end"]:
        return hour >= night["start"] or hour < night["end"]
    return night["start"] <= hour < night["end"]


def route(event: dict[str, Any], rules: dict[str, Any], hour: int | None = None) -> dict[str, Any]:
    """Route one normalised event. First matching rule wins."""
    kind = kind_of(event.get("label", ""), rules)
    if hour is None:
        hour = time.localtime(event.get("start") or time.time()).tm_hour
    night = is_night(hour, rules["night"])
    score = event.get("score")
    if isinstance(score, (int, float)) and score < rules["minScore"]:
        return {
            "rule": "below-threshold", "workflow": "ignore", "priority": "info",
            "reason": f"Confidence {round(score * 100)}% is under the {round(rules['minScore'] * 100)}% floor.",
            "kind": kind, "night": night,
        }
    zones = [str(z).lower() for z in event.get("zones") or []]
    for rule in rules["rules"]:
        when = rule.get("when") or {}
        if "kind" in when and kind not in when["kind"]:
            continue
        if "zones" in when and not any(k in z for z in zones for k in when["zones"]):
            continue
        if isinstance(when.get("night"), bool) and when["night"] != night:
            continue
        return {"rule": rule["id"], "workflow": rule["workflow"], "priority": rule["priority"],
                "reason": rule["reason"], "kind": kind, "night": night}
    return {"rule": "none", "workflow": "review", "priority": "low", "reason": "No rule matched.",
            "kind": kind, "night": night}
