# CinematicX · Revan-Class Energy Sword

Motion-tracked, sound-reactive 3D Revan hilt (Option B web stack).

Single-page Three.js app. No build step.

## Run locally

Open `index.html` in a local server (required for some browsers):

```bash
python3 -m http.server 8765
```

Then visit http://localhost:8765

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Site will be live at `https://<user>.github.io/<repo>/`

## Deploy to Vercel

```bash
npx vercel
```

Or connect the GitHub repo in the Vercel dashboard.

## Controls

- **Ignite** — extend / retract blade
- **Explode** — technical exploded-view of the hilt
- **Enable Motion** — iPhone/Android gyro + accelerometer (Safari will prompt)
- **Crystal** — Dual / Purple / Red kyber
- Drag to orbit (desktop). Hold phone like a hilt and swing (mobile).

## Stack (from the CinematicX spec)

- Frontend: Three.js + Web Audio API
- Motion: DeviceOrientation / DeviceMotion
- Physics: swing velocity → whoosh + trail + clash on deceleration
- Model: procedural Revan-class hilt (emitter, lens, dual kyber chamber, plasma gate, power cell, grip, pommel)

Unity / ARKit / 8th Wall / DJI SDK are Option A and not in this folder.
