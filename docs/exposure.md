# EXPOSURE

An independent fantasy-football and betting-research desk. It reads the
leagues a person already plays in, grades their lineup with reasoning they can
argue with, shows how much of their Sunday rests on a single player, and
compares publicly quoted numbers across books before sending them elsewhere to
act on it.

It lives at [`public/exposure/`](../public/exposure) and shares nothing with
the Cesium globe app but the repository and the dark instrument aesthetic. No
build step, no framework, no dependencies, no backend, no account, and it
keeps working with the signal off. Locally it is `/exposure/`
(`http://localhost:4173/exposure/` under `./start.sh`).

```sh
npm run test:exposure   # 53 unit tests, no browser needed
npm run qa:exposure     # 61 end-to-end checks driving the real app in Chromium
npm run qa:exposure -- --out shot.png   # …and a screenshot
```

---

## What it is not

These are product constraints, not aspirations, and
[`tests/exposure/compliance.test.mjs`](../tests/exposure/compliance.test.mjs)
fails the build when one of them slips:

- **Not affiliated with anyone.** Club names appear as city and mascot words
  because that is how you identify a game. There is no logo, helmet, wordmark,
  shield or club colour anywhere in the app — `data/teams.js` has no field that
  could carry one.
- **No video.** The Receipts tab is written scheme notes. Nothing is hosted,
  embedded, streamed or linked; when it is time to watch, the app says to open
  your own broadcast app and stops there.
- **No photographs.** Rows render an initials avatar. `document.images.length`
  is zero on every screen, and the end-to-end suite checks it.
- **No wagering.** There is no bet slip, wallet, stake field, deposit, cash-out
  or parlay builder. The only outbound action in the app is a link to a book's
  own site, and every one of them is a stub at `example.com`.
- **No borrowed product names.** A banned-naming scan runs over every shipped
  file and over the rendered DOM.

## The 21+ gate

The first visit opens on a modal carrying both required disclosures verbatim
and one question. Nothing behind it renders an odds surface until it is
answered, and "I am under 21" is a supported answer rather than a wall: it sets
`hideBetting`, the Market tab is replaced by the Command Center in the bottom
bar, the player card drops its Market tab, and the exposure table stops showing
prop leans. The fantasy desk keeps working. Settings can change the answer.

The same two paragraphs appear in the footer of every screen.

## The screens

| Screen | What it answers |
| --- | --- |
| **Home** | What does this week look like across every league I play in? |
| **Roster** | Who do I start, and why — with a compare drawer for the close calls. |
| **Player Card** | Overview, Opportunity, Market, Receipts. |
| **Exposure** | How much of my Sunday is riding on one player? |
| **Command Center** | What just happened, across every game I have a stake in? |
| **Market Desk** | Where is the best number, and what moved? |
| **Settings** | Scoring, leagues, betting visibility, and the door out. |

## The engines

### Start/Sit — [`js/engine/startsit.js`](../public/exposure/js/engine/startsit.js)

Four weighted inputs summed into one case number: how far the projection
clears the startable line for that slot in that scoring format, how the
opponent grades against the position, what the opportunity profile says about
volume, and what the market implies about the game environment. Injury
designations are applied last, because they cap certainty rather than change
the argument — `QUESTIONABLE` holds confidence to three out of five however
good the rest of the case is, and `OUT` is a sit at full confidence.

Every call ships with its five drivers and a reason written from them. The
reason is always exactly two sentences: the strongest argument for the call,
then the strongest thing arguing against it — or, when nothing does, what the
remaining risk actually is. A verdict nobody can check is a verdict nobody
should trust, so the drivers are on screen next to it.

### Exposure — [`js/engine/exposure.js`](../public/exposure/js/engine/exposure.js)

Counts starts, benches and saved leans per player across every connected
league and bands the result:

- **OK** — one start, or bench-only, or a single lean.
- **STACKED** — two starts, or one start plus a lean.
- **OVERLOADED** — three or more starts, or two starts plus a lean.

This is the screen that cannot exist inside any single league's own app,
because no single league can see the others.

### Market — [`js/engine/market.js`](../public/exposure/js/engine/market.js)

The best number for an over is the lowest line; for an under, the highest;
price breaks a tie, because two books at the same line are not the same bet.
An anytime-touchdown market has no line, so the best price wins outright.

A lean is written when the desk's own opportunity model sits more than 6% away
from the best available number (five probability points for anytime
touchdowns). The demo board is deliberately *not* derived from that model —
`marketAnchor()` shades each market by up to 14% to stand in for everything a
real board prices that raw opportunity does not — so the leans on the demo
slate are genuine disagreements rather than decoration.

### Live — [`js/engine/live.js`](../public/exposure/js/engine/live.js)

The Command Center's board is a simulation, and the app says so on screen. It
owns no timers and reads no clock: rates come from each player's own usage
profile divided by a 40-tick game, the screen calls `tick()`, and the same seed
always replays the same Sunday — which is what makes the alert logic testable.
Alerts cover touch droughts, goal-line carries, scores, turnovers and your
opponent's players.

## Where the names come from

The seed describes **roles**, not people: the workhorse back on one club, the
slot receiver on another, each with a usage profile, a projection and scheme
notes. [`js/data/rosterFeed.js`](../public/exposure/js/data/rosterFeed.js)
fills those roles with the players who actually hold them, from Sleeper's
public, key-free player index — no account, no token, read-only.

The split is the point:

| From the feed | From the desk |
| --- | --- |
| Name, club, position | Projections and the startable line |
| Injury designation | Opportunity figures (snaps, targets, shares) |
| Depth on the club | Prop numbers, best-number picks, leans |
| | Verdicts, confidence and the written reasons |

Identity and injury designations are facts about real people, so the app does
not invent them. Everything it computes is its own model on sample data, and
carries a `DEMO` badge wherever it is shown — a badge that is checked by the
end-to-end suite, not left to discipline.

The desk is always in one of three states, and the strip under the top bar
names it rather than leaving the user to guess:

- **LIVE** — fetched this session.
- **CACHED** — the last good fetch, trimmed to the sixteen clubs on the slate
  and served for up to a day. The raw index is several megabytes of every
  player in the database; a few hundred records is what reaches storage.
- **DEMO** — nothing answered, so the seed's placeholder names are showing and
  the strip says exactly that.

The load never throws and never blocks: the desk renders on the seed
immediately and the real names arrive when they arrive. A feed that is
unreachable, slow, blocked by a host's content policy, or serving something
unexpected changes nothing except that line. **Settings → Rosters** shows the
source and forces a refresh.

Two consequences worth knowing. A host that blocks cross-origin fetch — a
sandboxed embed with a strict content-security policy, for instance — leaves
the desk on `DEMO` names permanently; that is working as designed, and the
strip says so. And the depth ordering leans on the feed's own relevance rank,
which is a good proxy for "who is first on this club at this position" but not
a depth chart from the club.

## The rest of the demo data

Everything else under [`js/data/`](../public/exposure/js/data) is seed data: a
Week 1-style slate three weeks deep, 27 roles across three 12-team leagues with
deliberate overlap, and a board from three invented books.

The books are invented deliberately — printing made-up prices under a real
operator's name misrepresents that operator's board, and line shopping
demonstrates itself perfectly well with three fictional ones.

Beyond rosters, two seams are all a real integration needs, both in
[`js/providers.js`](../public/exposure/js/providers.js):

- `connectProvider(id)` runs a mock OAuth handshake — redirect, consent, token
  exchange, league fetch — with realistic latency and a failure path, and
  returns leagues in the shape the screens consume. Swapping in ESPN, Sleeper
  or Yahoo means replacing this function; no screen learns where a league came
  from. No credential is requested, stored or transmitted by the mock.
- `oddsProvider` exposes `games(week)` and `props(playerId, week)`. It is
  read-only by construction: there is no method on it that could place, price
  or settle a wager.

## Your data

All of it — the age answer, the account stub, connected leagues, saved leans,
settings — lives in one `localStorage` key on the device. There is no server,
so **Delete account and all data** genuinely deletes it rather than filing a
request. The magic-link sign-in is a local ceremony: no mail is sent and the
address never leaves the browser.

## Interface notes

Mobile-first: a fixed top bar (week picker, league switcher, alerts bell), a
scrolling column, and a five-target bottom bar whose fourth item swaps between
Market and the Command Center depending on whether odds are visible. Body text
is `#e8e6e1` on `#07080a` — roughly 16:1 — and the dimmest supporting text
holds about 7:1. Every visible control clears a 44px tap target, which the
end-to-end suite measures rather than assumes.

## Known limits

- The slate covers three weeks and sixteen clubs. Week 1 carries hand-set game
  states so the Command Center has something to show; weeks 2 and 3 are all
  upcoming.
- Game states are fixed properties of the demo, not a function of the wall
  clock — a demo that only looks alive on a Sunday afternoon is a demo nobody
  can review.
- Lineup editing is limited to swapping a bench player into a slot they are
  eligible for. The desk reads leagues; it does not write back to a provider.
- Defensive ranks, projections and opportunity figures are hand-written sample
  data. They are internally consistent and behave like the real thing, but they
  are not measurements of anything, which is what the `DEMO` badges say.
- The roster feed supplies identity for the 27 seeded roles only. It is not a
  full league-wide roster browser, and the demo's league rosters are still the
  seed's own construction.
- Nothing in the app has been run against the live feed from inside this
  repository's sandbox, which has no route to it; the adapter is covered by
  unit tests against fixture payloads and by an end-to-end run against a
  stubbed feed, and it degrades to `DEMO` rather than failing.
