// NEUROLENS · Camera lab — the operator's panel and the numbers beside the monitor. by Coach Colin

import { ASPECTS, BODIES, LENSES, LIGHTS, MOVES, STOPS } from './rigs.js';
import { fmtDistance, fmtShutter } from './optics.js';

const $ = (s) => document.querySelector(s);
const chip = (attr, id, label, on) => `<button class="btn seg ${on ? 'active' : ''}" data-${attr}="${id}" type="button">${label}</button>`;
const slider = (id, label, v, min, max, step, shown) => `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
const toggle = (id, label, on) => `<label class="toggle"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label>`;

// Focus slider is logarithmic: 0.1 m … 100 m.
const focusToSlider = (m) => Math.log10(m) * 100;
const sliderToFocus = (v) => 10 ** (v / 100);

export function cameraPanel(lab) {
  const s = lab.s; const lens = lab.lensDef; const body = lab.body;
  const zoom = lens.focals.length > 1;
  return `
  <div class="lv-head mono">CAMERA · LAB</div>
  <p class="intro">Operate a cinema camera on a 3D set. Every control is a real lens or camera setting and the monitor shows exactly what it does. Tap the monitor to pull focus, drag it to pan and tilt; drag the set to walk around it.</p>
  <div class="lv-sub">CAMERA BODY</div>
  <div class="chips">${BODIES.map((b) => chip('cb', b.id, b.name, b.id === s.body)).join('')}</div>
  <p class="small">${body.format} · ${body.sensor.w} × ${body.sensor.h} mm. ${body.note}</p>
  <div class="lv-sub">LENS</div>
  <div class="chips">${LENSES.map((l) => chip('cl', l.id, l.name, l.id === s.lens)).join('')}</div>
  ${zoom ? slider('cm-focal', 'Focal length', s.focal, lens.focals[0], lens.focals[1], 1, `${s.focal} mm`) : ''}
  <div class="lv-sub">APERTURE</div>
  ${lens.fixedN ? `<p class="small">Fixed at f/${lens.fixedN}.</p>` : `<div class="chips">${STOPS.filter((n) => n >= lens.N[0] && n <= lens.N[1]).map((n) => chip('cn', n, `f/${n}`, Math.abs(n - s.N) < 0.01)).join('')}</div>
  ${slider('cm-n', 'f-number', s.N, lens.N[0], lens.N[1], 0.1, `f/${s.N.toFixed(1)}`)}`}
  <div class="lv-sub">FOCUS</div>
  ${slider('cm-focus', 'Focus distance', focusToSlider(s.focusM).toFixed(0), -100, 200, 1, fmtDistance(s.focusM * 1000))}
  <div class="chips"><button class="btn seg" id="cm-af" type="button">Focus on the actor</button><button class="btn seg" id="cm-inf" type="button">Infinity</button></div>
  <div class="lv-sub">SHUTTER · FRAME RATE · ISO · ND</div>
  ${slider('cm-angle', 'Shutter angle', s.angle, 11, 360, 1, `${s.angle}°`)}
  <div class="chips">${body.fps.map((f) => chip('cf', f, `${f} fps`, f === s.fps)).join('')}</div>
  <div class="chips">${[50, 100, 200, 400, 800, 1600, 3200, 6400].map((i) => chip('ci', i, `ISO ${i}`, i === s.iso)).join('')}</div>
  ${slider('cm-nd', 'ND filter', s.nd, 0, 10, 1, `${s.nd} stops`)}
  <div class="chips"><button class="btn seg" id="cm-auto" type="button">Expose for me</button></div>
  <div class="lv-sub">LIGHT · WHITE BALANCE</div>
  <div class="chips">${LIGHTS.map((l) => chip('cli', l.id, l.label, l.id === s.light)).join('')}</div>
  ${slider('cm-wb', 'Camera white balance', s.wbK, 2500, 10000, 50, `${s.wbK} K`)}
  <div class="lv-sub">CAMERA POSITION</div>
  ${slider('cm-dist', 'Distance to actor', s.dist, 0.8, 12, 0.05, `${s.dist.toFixed(2)} m`)}
  ${slider('cm-orbit', 'Orbit', s.orbit, -90, 90, 1, `${s.orbit}°`)}
  ${slider('cm-height', 'Height', s.height, 0.3, 4, 0.05, `${s.height.toFixed(2)} m`)}
  ${slider('cm-pan', 'Pan', s.pan, -40, 40, 0.5, `${s.pan.toFixed(1)}°`)}
  ${slider('cm-tilt', 'Tilt', s.tilt, -30, 30, 0.5, `${s.tilt.toFixed(1)}°`)}
  ${slider('cm-roll', 'Dutch angle', s.roll, -30, 30, 1, `${s.roll}°`)}
  <div class="lv-sub">MOVE · TAKE</div>
  <div class="chips">${MOVES.map((m) => chip('cmv', m.id, m.label, m.id === s.move)).join('')}</div>
  ${slider('cm-sec', 'Duration', s.moveSec, 2, 12, 0.5, `${s.moveSec} s`)}
  <div class="chips"><button class="btn primary" id="cm-action" type="button">▶ Action</button><button class="btn seg" id="cm-rec" type="button">● Record take</button><button class="btn seg" id="cm-still" type="button">◎ Still</button></div>
  <div class="lv-sub">YOUR CONTENT ON SET</div>
  <div class="chips"><label class="btn seg file">Photo or video<input type="file" id="cm-file" accept="image/*,video/*" hidden></label><button class="btn seg" id="cm-cam" type="button">Webcam</button></div>
  <p class="small">Your picture or clip stands on the set beside the actor, so you can see how every lens and setting treats your own content. Nothing is uploaded.</p>
  <div class="lv-sub">MONITOR TOOLS</div>
  <div class="chips">${ASPECTS.map((a) => chip('ca', a.id, a.label, a.id === s.aspect)).join('')}</div>
  ${toggle('cm-thirds', 'Rule of thirds', s.thirds)}
  ${toggle('cm-zebra', 'Zebras (clipping above 95%)', s.zebra)}
  ${toggle('cm-false', 'False colour (exposure map)', s.falseColour)}
  ${toggle('cm-peak', 'Focus peaking', s.peaking)}
  ${toggle('cm-slab', 'Show frustum, focus plane and depth-of-field slab on the set', s.slab)}`;
}

export function cameraSide() {
  return `
  <div class="lv-head mono">WHAT THE LENS IS DOING</div>
  <div class="bigstats four" id="cm-stats"></div>
  <div class="math" id="cm-math"></div>
  <div class="lv-sub">DIRECTOR'S NOTES</div>
  <ul class="roles" id="cm-notes"></ul>
  <div class="card"><h3>How to read the set</h3><p>The gold wedge is what the camera sees; the gold sheet is the plane of focus; the pink slab is the depth of field — everything inside it is acceptably sharp. Floor tape marks every metre from the camera's starting spot.</p></div>`;
}

/** Refresh the side numbers (cheap; called a few times a second). */
export function cameraLive(lab) {
  const host = $('#cm-stats'); if (!host) return;
  const R = lab.readouts(); const o = R.o;
  host.innerHTML = `
    <div><b class="mono">${o.fov.h.toFixed(1)}°</b><small>horizontal view</small></div>
    <div><b class="mono">${o.eq.toFixed(0)} mm</b><small>full-frame equiv.</small></div>
    <div><b class="mono">${Number.isFinite(o.dof.totalMm) ? fmtDistance(o.dof.totalMm) : '∞'}</b><small>depth of field</small></div>
    <div><b class="mono">${o.offset >= 0 ? '+' : ''}${o.offset.toFixed(1)}</b><small>stops exposure</small></div>`;
  $('#cm-math').innerHTML = `
    <b>FOV</b> = 2·atan(${o.sensor.w}${o.sq > 1 ? `×${o.sq}` : ''} / 2·${o.f}) = ${o.fov.h.toFixed(1)}° × ${o.fov.v.toFixed(1)}° · crop ${o.crop.toFixed(2)}×<br>
    <b>c</b> = ${(o.c * 1000).toFixed(1)} µm · <b>H</b> = f²/(N·c) + f = ${fmtDistance(o.dof.hyperfocalMm)}<br>
    <b>near</b> ${fmtDistance(o.dof.nearMm)} · <b>focus</b> ${fmtDistance(o.sMm)} · <b>far</b> ${fmtDistance(o.dof.farMm)}<br>
    <b>blur at 12 m</b> = f²|d−s|/(N·d·(s−f)) → ${R.bgPx.toFixed(1)} px on 1080p<br>
    <b>T</b>${o.T.toFixed(2)} (f/${o.N} at ${(o.lens.transmission * 100).toFixed(0)}%) · <b>t</b> = ${lab.s.angle}°/360°/${lab.s.fps} = ${fmtShutter(o.t)} s<br>
    <b>EV</b>₁₀₀ = log₂(T²/t) − log₂(ISO/100) = ${o.ev.toFixed(2)} vs scene ${o.light.ev} − ND ${lab.s.nd}<br>
    <b>Airy</b> ⌀ ${(R.airy * 1000).toFixed(1)} µm · diffraction from f/${R.nd.toFixed(0)} · actor fills ${(R.fill * 100).toFixed(0)}% of the frame height · field ${R.width.toFixed(2)} m wide at the actor`;
  const notes = R.notes.length ? R.notes : [['Clean frame', 'Exposure within a stop, aperture clear of diffraction, shutter at the 180° film look.']];
  $('#cm-notes').innerHTML = notes.map(([h, b]) => `<li><b>${h}</b><span>${b}</span></li>`).join('');
}

/** Wire the panel to the lab. `rerender` rebuilds the panel when the choice set changes. */
export function bindCamera(lab, rerender) {
  const s = lab.s; const lens = () => lab.lensDef;
  const on = (sel, fn) => document.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
  const slide = (id, fn, show) => { const el = $(`#${id}`); if (!el) return; el.addEventListener('input', () => { fn(Number(el.value)); $(`#${id}-v`).textContent = show(); }); };
  on('[data-cb]', (b) => { s.body = b.dataset.cb; const fps = lab.body.fps; if (!fps.includes(s.fps)) s.fps = fps[0]; rerender(); });
  on('[data-cl]', (b) => { s.lens = b.dataset.cl; const L = lens(); s.focal = L.focals.length > 1 ? Math.round(Math.max(L.focals[0], Math.min(L.focals[1], s.focal))) : L.focals[0]; s.N = L.fixedN ?? Math.max(L.N[0], Math.min(L.N[1], s.N)); rerender(); });
  slide('cm-focal', (v) => { s.focal = v; }, () => `${s.focal} mm`);
  on('[data-cn]', (b) => { s.N = Number(b.dataset.cn); rerender(); });
  slide('cm-n', (v) => { s.N = v; }, () => `f/${s.N.toFixed(1)}`);
  slide('cm-focus', (v) => { lab.focusTarget = Math.max(lens().minFocusM, sliderToFocus(v)); }, () => fmtDistance(lab.focusTarget * 1000));
  $('#cm-af')?.addEventListener('click', () => lab.focusOnSubject());
  $('#cm-inf')?.addEventListener('click', () => { lab.focusTarget = 100; });
  slide('cm-angle', (v) => { s.angle = v; }, () => `${s.angle}°`);
  on('[data-cf]', (b) => { s.fps = Number(b.dataset.cf); rerender(); });
  on('[data-ci]', (b) => { s.iso = Number(b.dataset.ci); rerender(); });
  slide('cm-nd', (v) => { s.nd = v; }, () => `${s.nd} stops`);
  $('#cm-auto')?.addEventListener('click', () => {
    // Keep aperture and shutter (the creative choices); fix exposure with ND in whole stops, then ISO.
    const o = lab.optics(); let off = o.offset + s.nd;
    s.nd = Math.max(0, Math.min(10, Math.floor(off))); off -= s.nd;
    const isos = [50, 100, 200, 400, 800, 1600, 3200, 6400];
    const want = s.iso * 2 ** -off; s.iso = isos.reduce((a, b) => (Math.abs(Math.log2(b / want)) < Math.abs(Math.log2(a / want)) ? b : a));
    rerender();
  });
  on('[data-cli]', (b) => { s.light = b.dataset.cli; lab.applyLight(); rerender(); });
  slide('cm-wb', (v) => { s.wbK = v; }, () => `${s.wbK} K`);
  slide('cm-dist', (v) => { s.dist = v; }, () => `${s.dist.toFixed(2)} m`);
  slide('cm-orbit', (v) => { s.orbit = v; }, () => `${s.orbit}°`);
  slide('cm-height', (v) => { s.height = v; }, () => `${s.height.toFixed(2)} m`);
  slide('cm-pan', (v) => { s.pan = v; }, () => `${s.pan.toFixed(1)}°`);
  slide('cm-tilt', (v) => { s.tilt = v; }, () => `${s.tilt.toFixed(1)}°`);
  slide('cm-roll', (v) => { s.roll = v; }, () => `${s.roll}°`);
  on('[data-cmv]', (b) => { s.move = b.dataset.cmv; rerender(); });
  slide('cm-sec', (v) => { s.moveSec = v; }, () => `${s.moveSec} s`);
  $('#cm-action')?.addEventListener('click', () => lab.startMove(false));
  $('#cm-rec')?.addEventListener('click', () => lab.startMove(true));
  $('#cm-still')?.addEventListener('click', () => lab.still());
  $('#cm-file')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) lab.loadMedia(f).catch((err) => lab.onNote?.(`Could not load: ${err.message}`)); });
  $('#cm-cam')?.addEventListener('click', () => lab.useWebcam().catch((err) => lab.onNote?.(`Webcam unavailable: ${err.message}`)));
  on('[data-ca]', (b) => { s.aspect = b.dataset.ca; rerender(); });
  for (const [id, key] of [['cm-thirds', 'thirds'], ['cm-zebra', 'zebra'], ['cm-false', 'falseColour'], ['cm-peak', 'peaking'], ['cm-slab', 'slab']]) {
    $(`#${id}`)?.addEventListener('change', (e) => { s[key] = e.target.checked; });
  }
  // Keep sliders in step when a move or the monitor changes the camera.
  lab.syncInputs = () => {
    const set = (id, v, text) => { const el = $(`#${id}`); if (el && document.activeElement !== el) { el.value = v; $(`#${id}-v`).textContent = text; } };
    set('cm-dist', s.dist, `${s.dist.toFixed(2)} m`); set('cm-orbit', s.orbit, `${Math.round(s.orbit)}°`); set('cm-height', s.height, `${s.height.toFixed(2)} m`);
    set('cm-pan', s.pan, `${s.pan.toFixed(1)}°`); set('cm-tilt', s.tilt, `${s.tilt.toFixed(1)}°`);
    if (lens().focals.length > 1) set('cm-focal', s.focal, `${Math.round(s.focal)} mm`);
    set('cm-focus', focusToSlider(Math.max(0.1, lab.focusTarget)).toFixed(0), fmtDistance(lab.focusTarget * 1000));
  };
  lab.onLensChange = rerender;
}
