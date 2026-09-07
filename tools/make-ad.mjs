/* Render the LOOPBREAK ad images from real product screenshots.
 *
 *   node tools/make-ad.mjs <qb-shot.png> <wr-shot.png> [outdir]
 *
 * Shots are captured from the running app at 390x844, deviceScaleFactor 3.
 * Take them mid-rep with the answer tray up and the loop dial still cyan — a
 * blown (red) window makes a poor hero, and faking one is not an option, so
 * just answer fast.
 *
 * Built from the app's own design tokens, so the ad and the product stay one
 * system. Needs playwright available to node.
 */
import pw from 'playwright';
const { chromium } = pw;
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = process.argv[4] || path.join(ROOT, 'dist', 'ads');
fs.mkdirSync(OUT, { recursive:true });

/* Prefer locally inlined @font-face (offline, exact weights); fall back to the
   Google Fonts stylesheet when that file has not been generated. */
const localFonts = path.join(ROOT, 'dist', 'fonts-inline.css');
const FONTS = fs.existsSync(localFonts)
  ? fs.readFileSync(localFonts, 'utf8')
  : "@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Rajdhani:wght@400;500;600;700&display=swap');";
const b64 = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

const HERO_QB = b64(process.argv[2]);
const HERO_WR = b64(process.argv[3]);

/* ---- LOOPBREAK design tokens, taken from the app's own stylesheet ---- */
const TOKENS = `
:root{
  --void:#04070f; --deep:#070c18;
  --cy:#4DF0FF; --vi:#B96BFF; --mg:#FF3DDA; --am:#FFC44D; --li:#7CFF9E;
  --ink:#DFF6FF; --ink-dim:#7FA6BD; --ink-ghost:#4A6A80;
  --edge:rgba(77,240,255,.28); --edge-soft:rgba(77,240,255,.13);
  --f-display:'Chakra Petch',system-ui,sans-serif;
  --f-body:'Rajdhani','Chakra Petch',system-ui,sans-serif;
  --f-mono:ui-monospace,'DejaVu Sans Mono',monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--void);color:var(--ink);font-family:var(--f-body);-webkit-font-smoothing:antialiased}
.stage{position:relative;overflow:hidden;background:var(--void)}
.aurora{position:absolute;inset:-14%;
  background:
    radial-gradient(46% 34% at 14% 10%, rgba(77,240,255,.26), transparent 70%),
    radial-gradient(40% 30% at 88% 16%, rgba(255,61,218,.16), transparent 70%),
    radial-gradient(62% 44% at 52% 104%, rgba(185,107,255,.22), transparent 72%);
  filter:blur(34px)}
.grid-far{position:absolute;inset:0;opacity:.5;
  background-image:linear-gradient(rgba(77,240,255,.07) 1px,transparent 1px),
    linear-gradient(90deg,rgba(77,240,255,.07) 1px,transparent 1px);
  background-size:56px 56px;
  mask-image:radial-gradient(120% 90% at 50% 30%,#000 30%,transparent 78%);
  -webkit-mask-image:radial-gradient(120% 90% at 50% 30%,#000 30%,transparent 78%)}
.scan{position:absolute;inset:0;opacity:.30;mix-blend-mode:screen;
  background:repeating-linear-gradient(180deg,rgba(120,220,255,.06) 0 1px,transparent 1px 3px)}
.vig{position:absolute;inset:0;
  background:radial-gradient(120% 92% at 50% 38%,transparent 42%,rgba(2,4,10,.9) 100%)}
.inner{position:relative;height:100%;display:flex;flex-direction:column}

.mark{font-family:var(--f-display);font-weight:700;letter-spacing:.16em;
  background:linear-gradient(96deg,#EAFEFF,#4DF0FF 34%,#B96BFF 74%,#FF3DDA);
  -webkit-background-clip:text;background-clip:text;color:transparent}
.mono{font-family:var(--f-mono);text-transform:uppercase}
.eyebrow{font-family:var(--f-mono);color:var(--am);letter-spacing:.34em;text-transform:uppercase}
.setup{font-family:var(--f-display);font-weight:600;color:var(--ink-ghost);letter-spacing:.03em}
.punch{font-family:var(--f-display);font-weight:700;line-height:.92;letter-spacing:.005em;text-wrap:balance;
  background:linear-gradient(100deg,#EAFEFF,#4DF0FF 42%,#B96BFF 88%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 30px rgba(77,240,255,.28))}
.sub{color:var(--ink-dim);font-weight:500}

.card{position:relative;border:1px solid var(--edge);border-radius:16px;
  background:linear-gradient(155deg,rgba(28,58,92,.42),rgba(8,16,30,.72));
  box-shadow:inset 0 1px 0 rgba(180,245,255,.14),0 20px 50px -26px #000}
.card::after{content:'';position:absolute;inset:7px;border-radius:9px;pointer-events:none;opacity:.5;
  background:
    linear-gradient(var(--cy),var(--cy)) 0 0/16px 1.5px no-repeat,
    linear-gradient(var(--cy),var(--cy)) 0 0/1.5px 16px no-repeat,
    linear-gradient(var(--cy),var(--cy)) 100% 0/16px 1.5px no-repeat,
    linear-gradient(var(--cy),var(--cy)) 100% 0/1.5px 16px no-repeat,
    linear-gradient(var(--cy),var(--cy)) 0 100%/16px 1.5px no-repeat,
    linear-gradient(var(--cy),var(--cy)) 0 100%/1.5px 16px no-repeat,
    linear-gradient(var(--cy),var(--cy)) 100% 100%/16px 1.5px no-repeat,
    linear-gradient(var(--cy),var(--cy)) 100% 100%/1.5px 16px no-repeat}
.card__k{font-family:var(--f-mono);color:var(--cy);letter-spacing:.28em;text-transform:uppercase;opacity:.82}
.card__t{font-family:var(--f-display);font-weight:700;color:var(--ink);letter-spacing:.05em}
.card__b{color:var(--ink-dim);font-weight:500}

.phone{position:relative;border-radius:46px;padding:9px;
  background:linear-gradient(160deg,#2b3d52,#0a1220 60%,#05090f);
  box-shadow:0 0 0 1px rgba(150,225,255,.30),0 60px 110px -40px #000,0 0 130px -30px rgba(77,240,255,.55)}
.phone img{display:block;border-radius:38px;width:100%;height:auto}

.rail{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--edge-soft)}
.cell{padding:20px 22px 0;border-left:1px solid var(--edge-soft);position:relative}
.cell:first-child{border-left:0;padding-left:0}
.cell i{position:absolute;top:-4px;left:0;width:7px;height:7px;border-radius:2px;background:var(--pc);
  box-shadow:0 0 12px var(--pc)}
.cell:first-child i{left:0}
.cell b{display:block;font-family:var(--f-display);font-weight:700;color:var(--pc);letter-spacing:.16em}
.cell span{display:block;color:var(--ink-ghost);font-weight:500}
.foot{font-family:var(--f-mono);color:var(--ink-ghost);letter-spacing:.24em;text-transform:uppercase}
`;

const PHASES = [
  ['OBSERVE', 'eyes to the rotation',  'var(--cy)'],
  ['ORIENT',  'name the coverage',     'var(--vi)'],
  ['DECIDE',  'take the read',         'var(--am)'],
  ['ACT',     'ball out of his hand',  'var(--li)'],
];

const rail = (nameSize, descSize) => `
<div class="rail">${PHASES.map(([n, d, c]) => `
  <div class="cell" style="--pc:${c}"><i></i>
    <b style="font-size:${nameSize}px">${n}</b>
    <span style="font-size:${descSize}px;margin-top:4px">${d}</span>
  </div>`).join('')}</div>`;

const deltaCard = (pad, kSize, tSize, bSize) => `
<div class="card" style="padding:${pad}px">
  <div class="card__k" style="font-size:${kSize}px">The metric</div>
  <div class="card__t" style="font-size:${tSize}px;margin-top:10px">Δ-LOOP</div>
  <div class="card__b" style="font-size:${bSize}px;line-height:1.44;margin-top:10px">
    His cycle minus theirs. Positive means the ball was gone before the coverage
    finished rotating — the margin he actually plays with, in milliseconds.
  </div>
</div>`;

/* ------------------------------- PORTRAIT ------------------------------- */
const portrait = `
<style>${FONTS}${TOKENS}</style>
<div class="stage" style="width:1080px;height:1350px">
  <div class="aurora"></div><div class="grid-far"></div><div class="scan"></div><div class="vig"></div>
  <div class="inner" style="padding:60px 64px 54px">

    <div style="display:flex;align-items:baseline;justify-content:space-between">
      <div class="mark" style="font-size:38px">LOOPBREAK</div>
      <div class="mono" style="font-size:13px;letter-spacing:.3em;color:var(--ink-ghost)">OODA Command Deck</div>
    </div>

    <div style="display:flex;gap:52px;margin-top:54px;flex:1">
      <div style="width:560px;display:flex;flex-direction:column">
        <div class="eyebrow" style="font-size:14px">Decision speed, measured</div>
        <div class="setup" style="font-size:44px;margin-top:22px">You time the 40.</div>
        <div class="punch" style="font-size:82px;margin-top:6px">Who times<br/>the read?</div>
        <p class="sub" style="font-size:24px;line-height:1.46;margin-top:26px;max-width:530px">
          LOOPBREAK times a quarterback's decision in four separate phases and races it
          against the coverage's own cycle — on the phone he already carries.
        </p>
        <ul style="list-style:none;margin-top:34px;display:flex;flex-direction:column;gap:13px">
          ${[
            'Eight coverages, disguised before the snap',
            'Option routes with the conversion rules encoded',
            'Release timestamped by the accelerometer',
          ].map(t => `<li style="display:flex;gap:13px;align-items:flex-start;font-size:19px;color:var(--ink-dim);font-weight:500">
              <span style="color:var(--cy);font-family:var(--f-mono);font-size:15px;line-height:1.5">▸</span><span>${t}</span></li>`).join('')}
        </ul>
        <div style="margin-top:auto">${deltaCard(26, 12, 40, 18)}</div>
      </div>

      <div style="flex:1;display:flex;align-items:center;justify-content:center">
        <div class="phone" style="width:388px;transform:rotate(3.2deg)">
          <img src="${HERO_QB}" alt="" />
        </div>
      </div>
    </div>

    <div style="margin-top:44px">${rail(19, 15)}</div>
    <div class="foot" style="font-size:12.5px;margin-top:30px">
      Sensor-timed · no self-report · no wearables · quarterback + receiver packs
    </div>
  </div>
</div>`;

/* ------------------------------- LANDSCAPE ------------------------------ */
const landscape = `
<style>${FONTS}${TOKENS}</style>
<div class="stage" style="width:1920px;height:1080px">
  <div class="aurora"></div><div class="grid-far"></div><div class="scan"></div><div class="vig"></div>
  <div class="inner" style="padding:64px 76px 58px">

    <div style="display:flex;align-items:baseline;justify-content:space-between">
      <div class="mark" style="font-size:40px">LOOPBREAK</div>
      <div class="mono" style="font-size:13px;letter-spacing:.3em;color:var(--ink-ghost)">OODA Command Deck</div>
    </div>

    <div style="display:flex;gap:64px;flex:1;margin-top:38px">
      <div style="width:1000px;display:flex;flex-direction:column">
        <div class="eyebrow" style="font-size:14px">Decision speed, measured</div>
        <div class="setup" style="font-size:46px;margin-top:20px">You time the 40.</div>
        <div class="punch" style="font-size:104px;margin-top:4px">Who times the read?</div>
        <p class="sub" style="font-size:25px;line-height:1.46;margin-top:24px;max-width:840px">
          LOOPBREAK times a quarterback's decision in four separate phases — and races it
          against the coverage's own cycle. Disguised shells, a live sack clock, and a
          release timestamped by the accelerometer instead of a thumb.
        </p>
        <div style="display:flex;gap:22px;margin-top:34px;align-items:stretch">
          <div style="width:470px">${deltaCard(24, 12, 38, 17)}</div>
          <div class="card" style="padding:24px;flex:1">
            <div class="card__k" style="font-size:12px">Also shipping</div>
            <div class="card__t" style="font-size:26px;margin-top:10px">RECEIVER PACK</div>
            <div class="card__b" style="font-size:17px;line-height:1.44;margin-top:10px">
              First person off the line. Leverage, technique and the top of the coverage —
              raced against the defender's hip flip.
            </div>
          </div>
        </div>
        <div style="margin-top:auto">${rail(20, 15)}</div>
      </div>

      <div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;gap:0">
        <div class="phone" style="width:296px;transform:rotate(-6deg) translate(-6px,30px);z-index:1">
          <img src="${HERO_WR}" alt="" />
        </div>
        <div class="phone" style="width:334px;transform:rotate(4deg) translate(26px,-24px);z-index:2">
          <img src="${HERO_QB}" alt="" />
        </div>
      </div>
    </div>

    <div class="foot" style="font-size:13px;margin-top:26px">
      Sensor-timed · no self-report · no wearables · quarterback + receiver packs
    </div>
  </div>
</div>`;

const browser = await chromium.launch();
for(const [name, html, w, h] of [
  ['loopbreak-ad-portrait-1080x1350', portrait, 1080, 1350],
  ['loopbreak-ad-landscape-1920x1080', landscape, 1920, 1080],
]){
  const p = await browser.newPage({ viewport:{ width:w, height:h }, deviceScaleFactor:2 });
  await p.setContent(`<body style="margin:0">${html}</body>`, { waitUntil:'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.locator('.stage').screenshot({ path:path.join(OUT, `${name}.png`) });
  console.log(name);
  await p.close();
}
await browser.close();
