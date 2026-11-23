#!/usr/bin/env python3
"""Validate Raven's Creed dialogue JSON against the C++ data types, then map every path to its consequences.

Usage: python3 Tools/validate_dialogue.py [files...]   (defaults to Content/Data/Dialogue/*.json)

Checks:
  * every key is a real UPROPERTY of FRCDialogueGraph / Entry / Node / Choice / Condition / Effect
  * every enum value exists in the C++ enum (ERCConditionType, ERCEffectType, ERCTone, ...)
  * every Next/Entry target exists; no duplicate ids; no unreachable nodes
  * every point-of-no-return choice leads to a path that writes DO_OUTCOME, completes a quest or advances its stage
Then prints each distinct outcome with the flags, alignment shifts and companion reactions along its path.
Exit code 1 on any error.
"""
import glob
import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Source", "RavensCreed", "Public")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def cpp_enums():
    enums = {}
    for path in glob.glob(os.path.join(SRC, "**", "*.h"), recursive=True):
        text = read(path)
        for m in re.finditer(r"enum class (\w+)\s*:\s*uint8\s*\{(.*?)\};", text, re.S):
            body = re.sub(r"//.*", "", m.group(2))
            names = [re.split(r"[\s=(]", v.strip())[0] for v in body.split(",")]
            enums[m.group(1)] = {n for n in names if n and n != "Count"}
    return enums


def cpp_struct_fields():
    """Map struct name -> {field: type} for USTRUCTs, from UPROPERTY declarations."""
    structs = {}
    for path in glob.glob(os.path.join(SRC, "**", "*.h"), recursive=True):
        text = read(path)
        for m in re.finditer(r"struct\s+(?:RAVENSCREED_API\s+)?(F\w+)\s*(?::[^{]*)?\{(.*?)\n\};", text, re.S):
            fields = {}
            for p in re.finditer(r"UPROPERTY\([^;]*?\)\s*([\w<>:, ]+?)\s+(\w+)\s*(?:=[^;]*)?;", m.group(2), re.S):
                fields[p.group(2)] = p.group(1).strip()
            if fields:
                structs[m.group(1)] = fields
    return structs


ENUMS = cpp_enums()
STRUCTS = cpp_struct_fields()
errors, warnings = [], []


def check_struct(obj, struct, where):
    fields = STRUCTS.get(struct)
    if fields is None:
        errors.append(f"{where}: unknown struct {struct}")
        return
    lower = {k.lower(): (k, t) for k, t in fields.items()}  # JSON import matches names case-insensitively
    for key, val in obj.items():
        if key.lower() not in lower:
            errors.append(f"{where}: '{key}' is not a field of {struct}")
            continue
        name, typ = lower[key.lower()]
        inner = re.match(r"TArray<(\w+)>", typ)
        if typ in ENUMS:
            if val not in ENUMS[typ]:
                errors.append(f"{where}.{name}: '{val}' is not a value of {typ} ({', '.join(sorted(ENUMS[typ]))})")
        elif inner and inner.group(1) in STRUCTS:
            for i, item in enumerate(val):
                check_struct(item, inner.group(1), f"{where}.{name}[{i}]")
        elif typ == "bool" and not isinstance(val, bool):
            errors.append(f"{where}.{name}: expected true/false")
        elif typ == "float" and not isinstance(val, (int, float)):
            errors.append(f"{where}.{name}: expected a number")


def validate(path):
    graph = json.loads(read(path))
    name = graph.get("Id", os.path.basename(path))
    check_struct(graph, "FRCDialogueGraph", name)
    nodes = {}
    for n in graph.get("Nodes", []):
        if n["Id"] in nodes:
            errors.append(f"{name}: duplicate node {n['Id']}")
        nodes[n["Id"]] = n

    reached = set()

    def link(target, frm):
        if not target:
            return
        if target not in nodes:
            errors.append(f"{name}: {frm} -> missing node '{target}'")
        reached.add(target)

    for e in graph.get("Entries", []):
        link(e["Node"], "entry")
    for n in nodes.values():
        link(n.get("Next", ""), n["Id"])
        for c in n.get("Choices", []):
            link(c.get("Next", ""), n["Id"])
    for nid in nodes:
        if nid not in reached:
            errors.append(f"{name}: node '{nid}' is unreachable")

    # Walk every path (cycles cut at a revisit) and collect consequences.
    outcomes = defaultdict(list)

    def effects_summary(effects, acc):
        for e in effects:
            t = e.get("Type")
            if t in ("SetFlag", "AddFlag"):
                acc["flags"][e["Key"]] = ("+" if t == "AddFlag" else "") + str(e.get("Value", 1))
            elif t == "Alignment":
                acc["align"][e.get("Axis", "Honor")] = acc["align"].get(e.get("Axis", "Honor"), 0) + e.get("Value", 0)
            elif t == "CompanionApproval":
                acc["companions"][e["Key"]] = acc["companions"].get(e["Key"], 0) + e.get("Value", 0)
            elif t == "CompleteQuest":
                acc["quest"] = e.get("Victim", "?")
            elif t == "SetQuestStage":
                acc["stage"] = e.get("Value")
            elif t == "Event":
                acc["events"].append(e["Key"])
            elif t == "FactionRep":
                acc["factions"][e["Key"]] = acc["factions"].get(e["Key"], 0) + e.get("Value", 0)

    def walk(nid, acc, seen, path, gates, ponr):
        if not nid:
            key = acc["flags"].get("DO_OUTCOME") or acc["quest"]
            if ponr and not key and acc.get("stage") is None:
                errors.append(f"{name}: point-of-no-return path {' > '.join(path)} sets no outcome")
            if key:
                outcomes[(acc["quest"], acc["flags"].get("DO_OUTCOME"))].append((path, acc, gates))
            return
        if nid in seen or nid not in nodes:
            return
        node = nodes[nid]
        acc = json.loads(json.dumps(acc))
        effects_summary(node.get("OnEnter", []), acc)
        choices = node.get("Choices", [])
        if not choices:
            walk(node.get("Next", ""), acc, seen | {nid}, path + [nid], gates, ponr)
            return
        for c in choices:
            a2 = json.loads(json.dumps(acc))
            effects_summary(c.get("Effects", []), a2)
            g2 = gates + [c["RequirementHint"]] if c.get("RequirementHint") else gates
            walk(c.get("Next", ""), a2, seen | {nid}, path + [nid], g2, ponr or c.get("bPointOfNoReturn", False))

    empty = {"flags": {}, "align": {}, "companions": {}, "factions": {}, "events": [], "quest": None, "stage": None}
    for e in graph.get("Entries", []):
        walk(e["Node"], empty, set(), [], [], False)

    print(f"\n== {name}: {len(nodes)} nodes, {len(graph.get('Entries', []))} entries, "
          f"{sum(len(n.get('Choices', [])) for n in nodes.values())} choices")
    for (quest, code), runs in sorted(outcomes.items(), key=lambda kv: str(kv[0])):
        path, acc, gates = runs[0]
        print(f"  outcome {quest or '-'} (DO_OUTCOME={code or '-'}): {len(runs)} path(s), e.g. {' > '.join(path)}")
        if gates:
            print(f"    gates: {'; '.join(dict.fromkeys(gates))}")
        keep = {k: v for k, v in acc['flags'].items() if not k.startswith('DO_PROOF')}
        if keep:
            print(f"    flags: {', '.join(f'{k}={v}' for k, v in keep.items())}")
        if acc["align"]:
            print(f"    alignment: {', '.join(f'{k} {v:+g}' for k, v in acc['align'].items())}")
        if acc["companions"]:
            print(f"    companions: {', '.join(f'{k} {v:+g}' for k, v in acc['companions'].items())}")
        if acc["factions"]:
            print(f"    factions: {', '.join(f'{k} {v:+g}' for k, v in acc['factions'].items())}")
        if acc["events"]:
            print(f"    scripted events: {', '.join(acc['events'])}")


def main():
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "Content", "Data", "Dialogue", "*.json")))
    print(f"C++ types: {len(ENUMS)} enums, {len(STRUCTS)} structs")
    for f in files:
        validate(f)
    for w in warnings:
        print("WARNING:", w)
    for e in errors:
        print("ERROR:", e)
    print(f"\n{len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
