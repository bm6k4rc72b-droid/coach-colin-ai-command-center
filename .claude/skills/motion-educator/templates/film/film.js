// Built from storyboard.json: every time below comes from a shot's start or end.
// Write the storyboard first and pass its check: node kit/tools/storyboard.mjs films/NAME --png
import { createFilm } from "../../kit/engine/motion.js";

const storyboard = await (await fetch("storyboard.json")).json();
const film = await createFilm({ storyboard });
const { tl, stage, shots: s } = film;

film.captions();

// ── s01 ────────────────────────────────────────────────────────────────────
Object.assign(stage, { lx: 0.5, ly: 0.6, glow: 0.6 });
film.scene("#s01", 0, s.s01.end);
film.typeIn(film.split("#title"), 0.12);
film.sheen("#title", 1.2);
tl.to(stage, { glow: 0.9, duration: 1.4, ease: "power2.out" }, 0);

film.finish();
