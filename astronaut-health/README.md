# Astronaut Blood Panels: Inspiration4

**Made by Colin Cook.**

This is a static dashboard of the real blood tests from the four Inspiration4 crew members. Each crew member had a complete blood count and a comprehensive metabolic panel at 3 preflight and 4 postflight timepoints. The dashboard compares every postflight value with **that same person's own preflight baseline**, not with population lab ranges.

> For education only, not medical interpretation.

![Dashboard screenshot](docs/screenshot.png)
<!-- Screenshot placeholder: save a screenshot of the page as docs/screenshot.png -->

## What it does

- **Marker over time**: pick any of the 37 markers. You get one line per crew member, plotted by day from launch, with a vertical line at launch and the preflight period shaded. Pick a single crew member to see their own baseline band (mean ± 2 SD). Flagged points (|z| > 2) get a ringed dot, and the tooltip shows the z score and the lab reference range.
- **Change from own baseline**: a heatmap of z scores (markers × postflight timepoints) for one crew member at a time. Tap any row to chart it.
- **What moved**: every crew member × marker pair that was flagged at least once, and whether it was back within baseline at the last timepoint (R+194).
- **Missing values**: every absent or `NA` value is listed on the page. Nothing is filled in.

## Data

Source: [NASA Open Science Data Repository (OSDR)](https://osdr.nasa.gov/), Inspiration4 crew:

| Study | File (in `data/`) | Panel |
|---|---|---|
| [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | `LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv` | CBC (20 markers) |
| [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | `LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv` | CMP (19 markers, 17 after excluding eGFR) |

The files were downloaded from NASA's official open-data bucket (`s3://nasa-osdr`), and their checksums match NASA's. Only the **SUBMITTED** files are used, because they state units directly. The TRANSFORMED files are kept for reference only.

**Format of the SUBMITTED files.** There is one row per test result, with these columns: `ANALYTE, VALUE, RANGE_MIN, RANGE_MAX, UNITS, TEST_TYPE, SUBJECT_ID, SEX`. The last column is `TEST_DATE` in the CBC file and `timepoint` in the CMP file.

- **Crew IDs:** `C001`–`C004` (anonymized, kept exactly as given). The `SEX` column is never read into the output.
- **Timepoints:** `L-92, L-44, L-3` (days before launch) and `R+1, R+45, R+82, R+194` (days after return).
- **Units:** cells/uL, Thousand/uL, Million/uL, g/dL, %, fL, pg (CBC); mg/dL, mmol/L, g/dL, U/L, mL/min/1.73m2, (calc) (CMP).

## Run the processing

Requires Python 3.9+ and pandas.

```bash
cd astronaut-health
pip install pandas
python3 scripts/process.py
```

This rewrites `public/data.json` and prints a summary: markers, timepoints, the number of flags, every missing value, and every skipped z score.

Processing rules (`scripts/process.py`):

1. Reshape to long format: `crew, timepoint, days_from_launch, panel, marker, value, unit, range_min, range_max, raw_analyte`.
2. `L-N` → `-N` days from launch. `R+N` → `3 + N`, because Inspiration4 launched 2021-09-16 and splashed down about 3 days later.
3. Sex-labelled analyte names (`HEMOGLOBIN (FEMALE)` etc.) are merged into the plain marker. The original label is kept in `raw_analyte`.
4. Baseline = each person's preflight (L) values for that marker: mean and sample SD (n − 1).
5. Every postflight value gets `z = (value − baseline mean) / baseline SD`, flagged when |z| > 2. The z score is skipped when there are fewer than 2 preflight values.
6. Both eGFR rows are dropped (outdated race-based formula). BUN/creatinine ratio is kept but never z-scored (mostly missing).
7. Flags come only from the person's own baseline, never from the lab reference ranges.

## Preview locally

The page loads `data.json` with `fetch`, so open it through a local web server, not by double-clicking the file:

```bash
cd astronaut-health
python3 -m http.server 8000 --directory public
```

Then open <http://localhost:8000>.

## Deploy to Vercel

Import the repository in Vercel and set **Root Directory** to `astronaut-health`. There's no build step: `vercel.json` serves the `public/` folder as is. Chart.js loads from cdnjs.

## Limitations

- **Tiny baselines.** Each baseline is only 3 preflight values (2 for some markers), so the SD is often very small. Small, ordinary changes can then produce large z scores. For example, C004's eosinophils went from 2.6% to 4.5%, which is z ≈ +32, yet well inside the 0–8% lab range. 132 of 570 scored points are flagged. Treat a flag as "different from this person's few preflight draws", not "abnormal".
- **Four people, seven timepoints.** There's no control group and no adjustment for multiple comparisons. Day-to-day biological and lab variation is not modelled.
- **Missing data (30 values, left empty):**
  - BUN/creatinine ratio is `NA` in 21 rows and absent in 1.
  - Total bilirubin is `NA` for C001 at R+45.
  - The CBC file has no rows for: C002 MCHC at L-92, L-44, L-3 and R+1 (so C002 MCHC has no baseline and no z scores); C002 MCV at R+194; C003 MCH at L-92; C004 MCH at L-92 (those two baselines use 2 values).
- **Mission length.** Days after return are converted using a 3-day mission (actual ≈ 2.95 days).
- **Reference ranges** are the lab's printed ranges. They vary by crew member for some markers (for example sex-specific ranges and age), and are shown for context only.
- **One flag cut-off.** "Back within baseline" means |z| ≤ 2 at R+194. It says nothing about whether a value is clinically meaningful.
