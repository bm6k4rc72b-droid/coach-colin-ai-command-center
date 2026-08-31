# God's Eye View — Command Center skin

A copy of [**God's Eye View**](https://github.com/bilawalsidhu/gods-eye-view) by
[Bilawal Sidhu](https://github.com/bilawalsidhu), re-skinned with a dark,
high-tech instrumentation theme.

The upstream project is a real-time intelligence console for planet Earth: a
photorealistic 3D globe carrying live aircraft, vessels, satellites,
earthquakes, fires, traffic and public camera feeds, with hands-free voice
control. All application logic, data plumbing and features here are upstream's.
This fork changes **how it looks**, not what it does.

Upstream's own documentation is preserved verbatim as
[`README.upstream.md`](README.upstream.md) — read that for the full feature
list, data-source catalogue and operating notes.

---

## What the skin changes

Four files. No upstream rule was deleted, so pulling new commits from upstream
stays a clean merge.

| File | Change |
| --- | --- |
| `theme/command-center.css` | **New.** The entire skin: token overrides plus a decorative HUD layer. |
| `index.html` | Two lines — loads the theme after `style.css`, adds the `#cc-atmosphere` element. |
| `style.css` | Tokenized 98 hardcoded `rgba(0, 212, 255, …)` literals to `rgba(var(--accent-rgb), …)`. |
| `src/*.test.mjs` | 7 regex assertions widened to accept either colour notation (see below). |

Upstream's suite passes **2587/2587**, identical to a pristine checkout, and
`npm run build` is clean.

### Why `style.css` had to be touched

Upstream is about half-tokenized: 73 call sites use `var(--accent)`, but 98
inline the same cyan as a literal. Overriding the token alone would have
re-tinted roughly half the interface and left the rest on the old colour.

The sweep only rewrote literals that **exactly equalled upstream's own
`--accent` value**, so it is a provable no-op under upstream's palette —
`--accent-rgb: 0, 212, 255` is defined next to `--accent` in `style.css`, and
the file still renders identically with the theme removed. Deliberately left
alone: the cockpit teal (`#22e6e6`), the ambers, and every other colour that
was a genuine design distinction rather than a duplicated accent.

Four tests in `panelStackLayout.test.mjs` and `cockpitMarkup.test.mjs` matched
those literals with regexes, so 7 assertions were widened from
`rgba\(0, 212, 255, 0\.18\)` to
`rgba\((?:0, 212, 255|var\(--accent-rgb\)), 0\.18\)` — the colour *notation*
became flexible, nothing else. Selector, gradient shape, stop positions, alpha
values and box-shadow blur radius are all still asserted exactly, and the
originals still match, so the tests pass against pristine upstream too.

### The design

*Reading instruments in a dark room.*

- **The globe is the light source.** Chrome drops to near-black (`#03060b`) with
  a blue cast so the Earth is the only warm thing on screen.
- **Two accents, each with a job.** Signal cyan (`#38f0ff`) means live/active;
  ember amber (`#ffa63d`) means alert/attention.
- **Machined, not rounded.** Panel radius 16px → 4px, with a lit hairline along
  the top edge and bracket marks at opposing corners — targeting furniture, not
  soft cards.
- **Data reads as data.** Monospaced, tabular figures, uppercase labels tracked
  out at 0.14em, values glowing and labels receding.
- **Atmosphere.** One non-interactive film over the globe: a survey graticule
  masked to fade at centre, faint scanlines, and a vignette.

Layout tokens (`--left-stack-x`, `--dock-*`, and friends) are untouched.
Geometry stays exactly as upstream tuned it.

### Accessibility

The atmosphere layer is `pointer-events: none` at `z-index: 1` and can never
intercept a click. Scanlines drop under `prefers-reduced-motion`; the whole film
drops and glass goes opaque under `prefers-reduced-transparency`. Keyboard
focus rings were given an explicit cyan outline so they stay legible against
the darker ground.

---

## Running it

**Just run this:**

```bash
./start.sh
```

Then open <http://localhost:4173/>. That's it — it installs what it needs on
first run, creates your `.env`, and starts the app. Ctrl+C stops it. You only
need [Node.js](https://nodejs.org) installed first (the LTS build; `start.sh`
checks the version and tells you if it's too old).

### No API keys required

The app used to abort with `GOOGLE_MAPS_API_KEY not found`, so a keyless run
gave a dead white sphere. That check is now optional — `src/main.js` skips the
Google tileset when there's no key and lets `MapStackController`'s existing
keyless path take over, which was already written and already defaulted to
`'osm'` whenever no tileset was passed. Nothing else changed.

So with **zero keys, zero signup, zero credit card** you get:

- a real globe with OpenStreetMap imagery, and the whole interface and skin
- the no-key live layers: flights, military ADS-B, satellites, earthquakes,
  CCTV, radio, bikeshare, launches, and the bundled infrastructure datasets

Keys only add things on top. Put them in `.env` whenever you like:

| Key | Unlocks | Cost |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | Photorealistic 3D tiles — the cinematic look | 1,000 free sessions/mo, then ~$6/1,000 |
| `CESIUM_ION_TOKEN` | Bing imagery, Cesium World Terrain | Free tier |
| `AISSTREAM_API_KEY` | Live ships | Free |
| `FIRMS_MAP_KEY` | Active fires | Free |
| `TOMTOM_API_KEY` | Real road traffic | Free tier |
| `OPENAI_API_KEY` | Voice control | Metered, $5 session cap |

Keys are brokered server-side by the dev server, never exposed to the browser.
It binds to localhost by default — putting it on a LAN exposes your keys with
it, so set budget caps provider-side too.

## Publishing a link (and its limits)

`.github/workflows/pages.yml` publishes a static copy to GitHub Pages. Enable
it under **Settings → Pages → Source → GitHub Actions**, then run it from the
Actions tab.

**Read this before relying on it.** A static host has no backend, and this app
is not a static app: `vite.config.js` implements **16 `/api/*` routes** that
proxy and key-broker every live feed. Deployed statically you get the globe,
the interface and the skin — but aircraft, ships, CCTV, traffic, fires and
voice have nothing to call and report unavailable.

The link is a shop window. `./start.sh` is the app.

There is also no way to publish this as a Claude Artifact: Artifact pages are
sandboxed with a CSP that blocks all outbound fetch/XHR/WebSocket, which is
every data source and every map tile this depends on.

`scripts/build-static.sh` produces the same build locally. It handles two
things a plain `vite build` gets wrong for a project subpath: `vite-plugin-cesium`
writes its runtime to `dist/<base>/cesium` while the app requests
`/<base>/cesium` (so it is hoisted), and the hand-written root-absolute asset
paths (`/logo.svg`, `/models/*.glb`) are rewritten to include the base.

## Tweaking or removing the skin

Every colour, radius and glow lives in the `:root` block at the top of
`theme/command-center.css`. Change `--accent` and `--accent-rgb` together and
the entire interface re-tints.

To go back to stock, delete the two `index.html` lines that reference
`command-center.css` and `#cc-atmosphere`. `style.css` is standalone-correct on
its own and needs no revert.

---

## Attribution and licence

God's Eye View is © 2026 Bilawal Sidhu, released under the MIT Licence, which
is retained unmodified in [`LICENSE`](LICENSE). This copy is a derivative work
under those terms.

- Upstream: https://github.com/bilawalsidhu/gods-eye-view
- Announcement: https://www.spatialintelligence.ai/p/i-open-sourced-gods-eye-view

Bundled datasets carry their own separate terms — see
[`DATA_SOURCES.md`](DATA_SOURCES.md). Upstream's stated scope limit is kept as
is: the project does not build features for named-person search, face
recognition, or tracking individuals.

**Not vendored:** `docs/media/` (68 MB of demo GIFs). Image links in
`README.upstream.md` will not resolve; the upstream repo has them.
