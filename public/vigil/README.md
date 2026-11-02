# VIGIL · Elder Care Intelligence

A luxury demo console for an AI elder-safety business by Colin Cook: fall detection and private monitoring
for care communities and at-home care. Plain HTML/CSS/JS, no build step.

| File | What it does |
| --- | --- |
| `index.html` / `styles.css` | Seven views: Overview, Live Watch, Residents, Response, AI Concierge, Enterprise Build, The Business |
| `js/core.js` | Pure logic: quote totals and payment schedule, unit economics, response ladder, resident pose simulator (tested) |
| `js/app.js` | The views, the fall drill, the voice check-in, the AI incident report, and optional camera mode (`../vision-kit`: COCO-SSD → ByteTrack → FallWatch) |
| `data/catalog.json` | The enterprise build sheet: every feature with its price, tech, AI and GitHub repos. Shared by the app and the PDF |
| `VIGIL-Proposal-Colin-Cook.pdf` | The proposal, built from the catalog by `npm run proposal:vigil` |
| `js/media.js` | GPT Image stills and the Seedance 2.5 film (Higgsfield). `npm run media:vigil` self-hosts them |

Residents, facilities and outcomes are fictional. Accuracy and response figures are design targets.
