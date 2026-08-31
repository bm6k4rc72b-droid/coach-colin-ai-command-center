# Sentinel — Cyber Command Center

A single-screen defensive security console that lives alongside God's Eye View.
Open [`cyber/index.html`](index.html) in any browser — no build, no server, no
API keys, nothing leaves the page.

It pulls several security workflows onto one dark "command center" surface, in
the same instrument aesthetic as the globe skin (near-black blue ground, signal
cyan + ember amber, machined square panels, monospaced data).

## What's in it

| Module | What it does |
| --- | --- |
| **AI Pentest Agent** | Pick a demo target and deploy an autonomous agent. It streams a live recon → enumerate → scan → validate → report run into a terminal, surfacing OWASP-based findings one by one — the "AI hacker that finds your weak spots," reimagined as a defensive drill. |
| **Posture Index** | A weighted-CVSS gauge (0–100 + letter grade) that recomputes from open findings, with a per-category breakdown. |
| **Threat Radar** | A live canvas radar sweep plus a rolling SOC event feed (port scans, brute-force bursts, WAF matches) with a running "threats blocked" counter. |
| **OWASP Top 10 Coverage** | A 10-cell matrix that turns pass / warn / fail as findings land against each category. |
| **Vulnerability Findings** | A filterable board — severity, CVSS, CWE, target. Expand any row for impact, a proof-of-concept, and concrete remediation. |
| **Credential Hardening Lab** | An offline passphrase stress-tester: entropy, charset, breach-list check, keyboard-run detection, and a pessimistic offline crack-time estimate. Runs entirely in the browser. |

## Scope and safety

This is a **simulation and training environment**. Every target ends in
`.test` — a reserved, non-routable domain. Sentinel models a blue-team SOC
workflow and OWASP-aligned findings for education and drills; it does **not**
scan, connect to, or attack live systems. Only ever test infrastructure you own
or are explicitly authorized to assess. The credential lab does all of its
analysis locally and transmits nothing.

## Running it

```bash
open cyber/index.html      # macOS
xdg-open cyber/index.html  # Linux
```

Or just double-click the file. Everything is inline; the only external request
is Google Fonts, which falls back cleanly to system fonts offline.
