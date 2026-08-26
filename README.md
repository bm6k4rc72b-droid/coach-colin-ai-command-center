# Coach Colin · AI Command Center

A private, local-first console with two modules sharing one shell:

- **Chat** — a ChatGPT-equivalent workspace: streaming responses, persisted
  threads, five tuned personas, model switching, and an optional reasoning
  panel. Runs on the Claude API.
- **Cinematic Studio** — a Higgsfield-style video studio: build a shot list,
  compose each frame from real cinematography presets (framing, camera move,
  lens, lighting, grade, mood), queue the renders, and sequence the results on
  a duration-weighted timeline.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your keys
npm run dev
```

Open http://localhost:3000.

## Keys

| Module | Variable | Required? |
|---|---|---|
| Chat | `ANTHROPIC_API_KEY` | Yes |
| Studio | `RUNWAY_API_KEY` | No — falls back to preview mode |

The Studio is deliberately usable with **no key at all**. The bundled `mock`
provider renders each shot as an animated stand-in frame derived from the
composed prompt, so the shot list, render queue, and timeline all work before
you spend a cent. Add `RUNWAY_API_KEY` to swap in real Gen-4 footage.

## Architecture

```
app/
  page.tsx                    Command center overview
  chat/page.tsx               Chat module (client)
  studio/page.tsx             Studio module (client)
  api/chat/route.ts           Claude streaming over SSE
  api/studio/generate/route.ts   Start a render; list providers
  api/studio/jobs/[id]/route.ts  Poll one render
lib/
  personas.ts                 System prompts + effort per persona
  cinematic.ts                Preset vocabulary + prompt composer
  video/types.ts              VideoProvider interface
  video/mock.ts               Zero-key preview provider
  video/runway.ts             Runway Gen-4 adapter
  video/index.ts              Provider registry + job store
```

### Adding a video provider

Implement `VideoProvider` from `lib/video/types.ts` — `isConfigured()`,
`start()`, `poll()` — and add it to the `PROVIDERS` array in
`lib/video/index.ts`. The UI, queue, and timeline pick it up automatically.

### Known limits

- The render-job store in `lib/video/index.ts` is an in-memory `Map`. That's
  correct for a single local operator; move it to SQLite or Redis before
  running more than one instance.
- Shot lists and chat threads persist to `localStorage`, so they're per-browser
  and don't sync between devices.
- The Runway adapter's endpoints, auth headers, and polling contract are
  verified; its request **body field names** follow Runway's published SDK
  conventions but were not re-verified against the live API reference. If a
  call 400s, check the body shape first.
