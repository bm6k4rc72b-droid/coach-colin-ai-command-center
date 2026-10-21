# Neon Keys · Miami

A cinematic, scroll-driven exotic-car rental concept. Plain HTML/CSS/JS with
GSAP 3 + ScrollTrigger (and Lenis for smooth wheel scrolling on desktop). There is
no build step.

| File | What it does |
| --- | --- |
| `index.html` | The 13 scenes, nav, key tray and booking dialog |
| `styles.css` | Dark/neon theme: pink + cyan accents, gold for Ferrari, white for Rolls-Royce |
| `js/scenes.js` | Running order, hold lengths, cross-fade and copy timing (pure, tested) |
| `js/media.js` | Poster + clip URL for every scene (Higgsfield-generated) |
| `js/main.js` | Pins the stage, builds the scrubbed timeline, drives the clip playheads |

To change the pacing, edit `len` in `SCENES` (in viewport heights) and run
`npm run test:miami-keys`.

To self-host the media, run `npm run media:miami-keys`. It needs ffmpeg and network
access to the Higgsfield CDN.

Booking is a front-end demo: it prices the dates but sends nothing.
