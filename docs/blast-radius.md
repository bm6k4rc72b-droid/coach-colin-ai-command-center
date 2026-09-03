# Blast Radius — cloud identity architecture and AI system security

A browser console that analyses one cloud estate from both ends: what its
identities can reach, and what its LLM agent can be talked into doing with
them. It runs entirely client-side — no backend, no API key, no network call —
and every number it displays is computed live by the modules in
`public/blast-radius/js/`.

Locally it is `/blast-radius/` (`http://localhost:4173/blast-radius/` under
`./start.sh`). It installs to a home screen like the other app in this
repository and works offline after the first visit.

---

## The argument it exists to make

An LLM agent is not a new kind of thing to secure. It is a new kind of
**principal**: one that reads attacker-controlled text all day, holds
credentials, and calls APIs on behalf of somebody it cannot authenticate.
Everything that makes it dangerous is already covered by the identity
discipline. What is new is that the confused deputy now speaks English and is
very agreeable.

That has a practical consequence, and the console is built to demonstrate it
rather than assert it: **the AI half of an incident is rarely where the leverage
is.** Prompt injection is unfixable in the sense that matters — you cannot get a
detector to zero — so the question worth engineering is what the agent's
credentials can reach once a message does get through. That question is an
identity question, it has been answerable for fifteen years, and the answer here
costs $4,000.

---

## What it computes

Six modules, each pure and unit-tested, and none of them containing a
hardcoded finding.

### 1. A policy evaluation engine that shows its work

`js/iam.js` implements the AWS evaluation chain — organizational guardrail,
explicit deny, permissions boundary, identity grant, and cross-account
agreement — and returns the ordered list of checks that produced the verdict
along with the statement that decided it. Entra and GCP estates are expressed in
the same statement shape; the vocabulary differs, the lattice does not.

Conditions that the engine cannot interpret **fail closed**. An analysis tool
that guesses generously under-reports findings, which is the one direction it
must never be wrong in.

### 2. An identity graph built from techniques, not from a diagram

`js/graph.js` asks the policy engine real questions to derive edges between
principals — eight techniques covering role assumption, trust-policy rewriting,
self-granting IAM writes, `PassRole` into compute, stored-credential reads,
deployment hijacking, federated subject wildcards, and agent tool delegation.
Each edge carries the evidence that produced it and a cost representing attacker
effort, so the shortest path is the one somebody would actually walk rather than
the one with the fewest boxes.

The headline metric is **identities that can escalate to crown-jewel data**, not
edge count. Splitting one over-scoped role into three least-privilege roles adds
principals and therefore adds edges — a genuine improvement that a naive metric
reports as a regression. This one does not.

### 3. An AI architecture review that terminates in cloud identity

`js/aisec.js` reviews an agent specification against a threat catalogue by
trust boundary, then composes the interesting artefact: the end-to-end chain
from untrusted text, through the tool surface, into the identity graph, to a
named crown-jewel resource. Each half is unremarkable. The composition is the
incident.

In the demonstration estate that chain is: a poisoned knowledge-base article →
the support agent → its shared tool role → the payments signing key stored in
Secrets Manager → the cardholder data vault. Nobody designed it. Two ordinary
grants composed.

### 4. A prompt-injection detector that publishes its own failures

`js/injection.js` is a weighted feature model over fifteen signal families —
instruction override, tool coercion, exfiltration channels, obfuscation,
concealment, latent triggers, and so on — with reinforcing combinations, because
a message that both hijacks control *and* supplies a delivery address is
different in kind from one that merely sounds bossy.

It ships with the corpus it is measured on, and the console displays the
measurement: **precision 0.92, recall 0.86 at the default threshold**, plus a
threshold sweep so the trade-off is visible. Three samples carry the argument:

| Sample | What it shows |
| --- | --- |
| `mal-13` | A pure social pretext with no injection vocabulary at all. Missed, and no text-level detector will catch it. |
| `mal-14` | A Spanish-language payload. Partially caught — the feature set is English-first, and this is what that costs. |
| `ben-13` | A genuine operator-written knowledge-base article that the detector flags. Persistence, concealment, an egress address — textually indistinguishable from an attack. |

`ben-13` is the most important sample in the corpus. Nothing in the words
separates it from an injection; only **provenance** does. That is the whole
argument for tagging context by origin instead of scoring it harder, and it is
recorded as ADR-004.

The detector was tuned against this corpus, so these numbers are an upper bound
rather than a field estimate. A hand-built corpus of 27 samples cannot tell you
what a detector does against an adversary who has seen it.

### 5. Detection engineering, scored

`js/telemetry.js` generates fourteen days of plausible activity for the estate
and threads through it the two attacks the identity graph says are available.
`js/detect.js` runs four rule shapes over it — single-event, learned baseline,
ordered sequence, and windowed threshold — and scores them for coverage,
precision and time to first signal.

The background traffic is the half that matters. It includes a payments engineer
spot-checking a vault object by hand, a nightly reconciliation batch that trips
the volume rule exactly as its author predicted, a legitimate new integration
that trips the first-seen rule, and a real operator article that trips the
injection rule. The result is **13 alerts in 14 days at 0.54 precision** — a
believable detection programme, not a demo where everything works.

Alerts deduplicate on a thirty-minute cooldown, keeping their events. Without
that, the bulk vault read arrives as forty pages and the fortieth is the one
nobody reads.

### 6. Quantified risk

`js/fair.js` models each scenario as frequency × magnitude, both uncertain —
PERT for frequency, lognormal fitted to a 90% interval for magnitude — and
simulates 20,000 years per scenario with a fixed seed, so a number in a report
is reproducible by whoever reads it. It produces a loss exceedance curve and
ranks controls by expected loss reduced per unit of spend.

The ranking is the durable output. The estimates move; the order rarely does.
In this estate a **$4,000 policy change outranks a $90,000 approval queue by
roughly twenty-five to one**, which is an argument no 5×5 matrix can make.

---

## Using it

The control rail on the right is always visible, because the controls are the
argument. Ten of them, one budget: some rewrite cloud policy, some rewrite the
agent's design, two do both. Everything on screen recomputes when one is
toggled — the graph, the review, the kill chain, the loss curve and the residual
risk.

Enabling everything ($347k a year) takes the estate from five identities able to
escalate to crown-jewel data down to one, the AI exposure score from 95 to 21,
and modelled annual loss from $12M to $1.6M.

Things worth doing:

- **Identity → Explain a decision.** Ask whether the support agent's tool role
  can read the payments secret. Read the chain. Then enable *Scope the agent's
  secret access* and ask again.
- **Identity → Blast radius.** Switch the compromised principal to GitHub
  Actions and watch a pull request from a fork reach the production
  administrator role in two hops.
- **AI security → Injection lab.** Load `ben-13` and read the score. It is a
  false positive, it is supposed to be, and it is the reason ADR-004 exists.
- **Risk → Where to spend next.** Toggle controls from the ranking table and
  watch the residual curve move.

---

## What it does not do

- **It is not a scanner.** It analyses a declared estate, not a live account.
  Pointing it at real infrastructure would mean credentials, an agent, and a
  different threat model — which is the honest reason it does not.
- **The estate is fictional.** Solstice Retail Group does not exist. The
  weaknesses in it are the ordinary kind, written the way a competent engineer
  writes them on a deadline.
- **The risk inputs are estimates.** Every scenario names its basis and its
  softest assumption. The agent scenario's conversion factor moves the answer by
  a factor of three, which is stated on the page rather than buried.
- **Control effects are multiplicative.** Where two controls remove the same
  hop, the model slightly overstates the pair. The ranking is unaffected, and
  the alternative is a co-occurrence table nobody would maintain honestly.
- **The detector is a triage aid, not a boundary.** Everything it catches, it
  catches by recognition. The controls that survive contact with a novel payload
  are the ones that constrain what the agent's identity can do.

---

## Running the checks

```sh
npm run test:blast-radius   # 42 unit tests over the six engines
npm run qa:blast-radius     # drives the real app in Chromium, 21 assertions
npm run build:blast-radius  # flatten to one self-contained HTML file
```

The unit tests assert the published numbers rather than restating them: the
corpus benchmark is recomputed and the two known misses are asserted **by
name**, the samplers are checked against their analytic moments, the seeded
simulation is checked for reproducibility, and the ranking test asserts that the
$4k policy fix outranks the $90k approval queue — because that is the claim the
console is making.

The browser suite checks that the numbers actually move: enabling controls must
remove escalation edges, deny a call that was previously allowed, and reduce
residual loss. Screenshots of every view are written to `qa-shots/blast-radius/`.

---

## Handing it to somebody

The app is plain ES modules with no build step, which is right for the
repository and wrong for sharing: opening `index.html` off disk cannot resolve
`./js/iam.js`, because module imports need a server.

`npm run build:blast-radius` flattens the thirteen modules and the stylesheet
into one ~270 kB HTML file at `qa-shots/blast-radius.html` that runs from
anywhere — a `file://` open, an email attachment, any static host. It is a
concatenator rather than a bundler, which is all an app with no dependencies
needs. `--artifact` emits the same page without the document wrapper, for a
host that supplies its own `<head>`.

The GitHub Pages workflow publishes from `main` only, so the hosted copy at
`/blast-radius/` appears once this work is merged there.

---

## Layout

```
public/blast-radius/
  index.html              shell: top bar, view region, control rail
  styles.css              dark instrument skin, matching the Command Center theme
  sw.js                   offline cache
  js/
    iam.js                policy evaluation with an explainable decision chain
    graph.js              escalation techniques, cheapest-path search, blast radius
    estate.js             the demonstration estate and the ten controls
    aisec.js              agent threat catalogue, architecture review, kill chain
    injection.js          feature-model detector, labelled corpus, defence simulator
    telemetry.js          synthetic event stream with labelled attacks
    detect.js             correlation engine and the detection set
    fair.js               Monte Carlo loss model
    scenarios.js          loss scenarios and control effects
    portfolio.js          decision records, threat models, incident write-ups
    charts.js             SVG primitives
    views.js              the six views
    app.js                state, derivation, rendering
tests/blast-radius/       unit tests
scripts/qa-blast-radius.mjs            browser suite
scripts/build-blast-radius-standalone.mjs   single-file build
```
