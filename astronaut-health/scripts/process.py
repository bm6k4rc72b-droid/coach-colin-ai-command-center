"""Inspiration4 crew blood panels -> public/data.json

Source: NASA OSDR, OSD-569 (CBC, LSDS-7) and OSD-575 (CMP, LSDS-8).
Only the *_SUBMITTED.csv files are read; they state units directly.

Run from the astronaut-health/ folder:
    python3 scripts/process.py
"""

from __future__ import annotations

import json
import math
import re
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "public" / "data.json"

SOURCES = [
    {
        "file": "LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv",
        "timepoint_col": "TEST_DATE",
        "study": "OSD-569",
        "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-569",
    },
    {
        "file": "LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv",
        "timepoint_col": "timepoint",
        "study": "OSD-575",
        "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
    },
]

# Inspiration4 launched 2021-09-16 and splashed down 2021-09-18 (~3 days in orbit).
# "R+N" means N days after return, so it sits MISSION_DAYS + N days after launch.
MISSION_DAYS = 3

# eGFR rows use the outdated race-based formula: dropped entirely.
EXCLUDE_MARKERS = {"eGFR AFRICAN AMERICAN", "eGFR NON-AFR. AMERICAN"}
# Kept in the data, but never z-scored (mostly missing in the source).
NO_ZSCORE_MARKERS = {"BUN/CREATININE RATIO"}

Z_FLAG = 2.0
MIN_BASELINE = 2

SEX_LABEL = re.compile(r"\s*\((?:FE)?MALE\)\s*$")
TIMEPOINT = re.compile(r"^([LR])([+-])(\d+)$")


def parse_timepoint(label: str) -> int:
    m = TIMEPOINT.match(label.strip())
    if not m:
        raise ValueError(f"Unrecognised timepoint label: {label!r}")
    phase, sign, n = m.group(1), m.group(2), int(m.group(3))
    offset = n if sign == "+" else -n
    return offset if phase == "L" else MISSION_DAYS + offset


def to_number(s: pd.Series) -> pd.Series:
    # "NA" / "N/A" stay missing; nothing is filled in.
    return pd.to_numeric(s.replace({"NA": None, "N/A": None, "": None}), errors="coerce")


def load(src: dict) -> pd.DataFrame:
    raw = pd.read_csv(DATA / src["file"], dtype=str, keep_default_na=False)
    df = pd.DataFrame(
        {
            "crew": raw["SUBJECT_ID"],  # anonymised IDs kept exactly as given
            "timepoint": raw[src["timepoint_col"]],
            "panel": raw["TEST_TYPE"],
            "raw_analyte": raw["ANALYTE"],
            "marker": raw["ANALYTE"].str.replace(SEX_LABEL, "", regex=True),
            "value": to_number(raw["VALUE"]),
            "unit": raw["UNITS"],
            "range_min": to_number(raw["RANGE_MIN"]),
            "range_max": to_number(raw["RANGE_MAX"]),
        }
    )  # SEX is deliberately not carried forward.
    df["days_from_launch"] = df["timepoint"].map(parse_timepoint)
    return df


def add_zscores(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    pre = df[(df["days_from_launch"] < 0) & df["value"].notna()]
    base = (
        pre.groupby(["crew", "marker"])["value"]
        .agg(baseline_n="count", baseline_mean="mean", baseline_sd="std")  # sample SD (ddof=1)
        .reset_index()
    )
    df = df.merge(base, on=["crew", "marker"], how="left")
    df["baseline_n"] = df["baseline_n"].fillna(0).astype(int)

    post = df["days_from_launch"] > 0
    usable = (
        post
        & df["value"].notna()
        & (df["baseline_n"] >= MIN_BASELINE)
        & (df["baseline_sd"] > 0)
        & ~df["marker"].isin(NO_ZSCORE_MARKERS)
    )
    df["z"] = None
    df.loc[usable, "z"] = (df.loc[usable, "value"] - df.loc[usable, "baseline_mean"]) / df.loc[usable, "baseline_sd"]
    df["z"] = df["z"].astype(float)
    df["flag"] = df["z"].abs() > Z_FLAG
    return df, base


def what_moved(df: pd.DataFrame) -> list[dict]:
    post = df[df["days_from_launch"] > 0]
    last_tp = post["days_from_launch"].max()
    out = []
    for (crew, marker), g in post.groupby(["crew", "marker"]):
        flagged = g[g["flag"]]
        if flagged.empty:
            continue
        last = g[g["days_from_launch"] == last_tp]
        last_z = last["z"].iloc[0] if len(last) else float("nan")
        if math.isnan(last_z):
            status = "no data at last timepoint"
        elif abs(last_z) <= Z_FLAG:
            status = "back within baseline"
        else:
            status = "still outside baseline"
        out.append(
            {
                "crew": crew,
                "marker": marker,
                "panel": g["panel"].iloc[0],
                "unit": g["unit"].iloc[0],
                "flagged_timepoints": flagged.sort_values("days_from_launch")["timepoint"].tolist(),
                "max_abs_z": round(float(flagged["z"].abs().max()), 2),
                "last_timepoint": post.loc[post["days_from_launch"] == last_tp, "timepoint"].iloc[0],
                "last_z": None if math.isnan(last_z) else round(float(last_z), 2),
                "status": status,
            }
        )
    return sorted(out, key=lambda r: (r["marker"], r["crew"]))


def find_missing(df: pd.DataFrame) -> list[dict]:
    """Every crew x timepoint x marker that has no numeric value (absent row or NA)."""
    grid = pd.MultiIndex.from_product(
        [sorted(df["crew"].unique()), sorted(df["timepoint"].unique(), key=parse_timepoint), sorted(df["marker"].unique())],
        names=["crew", "timepoint", "marker"],
    ).to_frame(index=False)
    grid = grid.merge(df[["crew", "timepoint", "marker", "panel", "value"]], how="left", on=["crew", "timepoint", "marker"])
    # A marker belongs to one panel only; drop grid cells that pair a marker with the wrong panel's file.
    panel_of = df.groupby("marker")["panel"].first()
    grid["panel"] = grid["marker"].map(panel_of)
    miss = grid[grid["value"].isna()]
    rows_present = set(zip(df["crew"], df["timepoint"], df["marker"]))
    return [
        {
            "crew": r.crew,
            "timepoint": r.timepoint,
            "marker": r.marker,
            "panel": r.panel,
            "reason": "value reported as NA" if (r.crew, r.timepoint, r.marker) in rows_present else "row absent from file",
        }
        for r in miss.itertuples()
    ]


def clean(v):
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, float):
        return round(v, 4)
    return v


def main() -> None:
    df = pd.concat([load(s) for s in SOURCES], ignore_index=True)
    excluded_rows = int(df["marker"].isin(EXCLUDE_MARKERS).sum())
    df = df[~df["marker"].isin(EXCLUDE_MARKERS)].copy()

    df, base = add_zscores(df)
    df = df.sort_values(["panel", "marker", "crew", "days_from_launch"]).reset_index(drop=True)

    # Includes crew x marker pairs with no preflight values at all.
    pairs = df[["crew", "marker", "baseline_n", "baseline_sd"]].drop_duplicates(["crew", "marker"])
    scored = ~pairs["marker"].isin(NO_ZSCORE_MARKERS)
    skipped = pairs[scored & (pairs["baseline_n"] < MIN_BASELINE)][["crew", "marker", "baseline_n"]]
    zero_sd = pairs[scored & (pairs["baseline_n"] >= MIN_BASELINE) & (pairs["baseline_sd"] == 0)][["crew", "marker"]]

    cols = [
        "crew", "timepoint", "days_from_launch", "panel", "marker", "value", "unit",
        "range_min", "range_max", "raw_analyte", "baseline_n", "baseline_mean", "baseline_sd", "z", "flag",
    ]
    records = [{k: clean(v) for k, v in row.items()} for row in df[cols].to_dict("records")]

    timepoints = (
        df[["timepoint", "days_from_launch"]].drop_duplicates().sort_values("days_from_launch").to_dict("records")
    )
    markers = (
        df[["panel", "marker", "unit"]].drop_duplicates(["panel", "marker"]).sort_values(["panel", "marker"]).to_dict("records")
    )
    moved = what_moved(df)
    missing = find_missing(df)

    out = {
        "meta": {
            "title": "Inspiration4 crew blood panels",
            "generated": date.today().isoformat(),
            "sources": [{k: s[k] for k in ("study", "file", "url")} for s in SOURCES],
            "mission_days": MISSION_DAYS,
            "z_flag": Z_FLAG,
            "min_baseline": MIN_BASELINE,
            "excluded_markers": sorted(EXCLUDE_MARKERS),
            "no_zscore_markers": sorted(NO_ZSCORE_MARKERS),
            "zscore_skipped": skipped.to_dict("records"),
            "zero_sd_skipped": zero_sd.to_dict("records"),
        },
        "crew": sorted(df["crew"].unique().tolist()),
        "timepoints": timepoints,
        "markers": markers,
        "records": records,
        "moved": moved,
        "missing": missing,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, allow_nan=False))

    n_flags = int(df["flag"].sum())
    print(f"Wrote {OUT.relative_to(ROOT)}")
    print(f"  crew:        {len(out['crew'])} ({', '.join(out['crew'])})")
    print(f"  markers:     {len(markers)} (CBC {sum(m['panel']=='CBC' for m in markers)}, CMP {sum(m['panel']=='CMP' for m in markers)})")
    print(f"  timepoints:  {len(timepoints)} ({', '.join(t['timepoint'] for t in timepoints)})")
    print(f"  records:     {len(records)}  (excluded {excluded_rows} eGFR rows)")
    print(f"  z scores:    {int(df['z'].notna().sum())}")
    print(f"  flags |z|>{Z_FLAG:g}: {n_flags} across {len(moved)} crew x marker pairs")
    print(f"  missing values ({len(missing)}):")
    for m in missing:
        print(f"    {m['crew']} {m['timepoint']:>6} {m['marker']}: {m['reason']}")
    if len(skipped):
        print("  z score skipped (< 2 preflight values):")
        for r in skipped.itertuples():
            print(f"    {r.crew} {r.marker} (preflight values: {r.baseline_n})")
    if len(zero_sd):
        print("  z score skipped (preflight SD = 0):")
        for r in zero_sd.itertuples():
            print(f"    {r.crew} {r.marker}")


if __name__ == "__main__":
    main()
