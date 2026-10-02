/**
 * Start screen, pause, help (controls) and debrief overlays.
 */
import { CASE } from '../config/anatomy';
import type { Debrief } from '../procedure/debrief';
import { $, esc } from './dom';

export const CONTROLS: [string, string][] = [
  ['1 – 7', 'Tools: guide, wire, balloon, stent, contrast, fluoro, measure'],
  ['W / S · wheel', 'Advance / retract the active device (hold Shift = fine)'],
  ['A / D', 'Rotate the guide or wire tip'],
  ['E (hold) / Q', 'Inflate (Shift = fine) / deflate'],
  ['G', 'Give heparin'],
  ['5 or C', 'Contrast injection (cine)'],
  ['Space or 6 (hold)', 'Fluoroscopy pedal'],
  ['Tab', 'Switch 3D ↔ X-ray'],
  ['V · arrows', 'Cycle C-arm presets · fine-tune angles'],
  ['F · L', 'Camera follow tip · anatomy labels'],
  ['H · M · N', 'Help · mentor panel · sound'],
  ['Esc', 'Pause'],
  ['Drag · Ctrl + wheel', 'Orbit · zoom the 3D camera'],
];

const keysHtml = () =>
  `<div class="keys">${CONTROLS.map(([k, v]) => `<div>${k
    .split(' ')
    .map((p) => (/^[·/+–(]|^or$/.test(p) ? esc(p) : `<kbd>${esc(p)}</kbd>`))
    .join(' ')}</div><div>${esc(v)}</div>`).join('')}</div>`;

export function renderStart(onStart: () => void, onDemo: () => void): void {
  const el = $('start');
  el.innerHTML = `
  <div class="card" role="dialog" aria-labelledby="start-title">
    <h1 id="start-title">PCI Simulator · mid-LAD stenting</h1>
    <div style="color:var(--muted)">Right radial access · 6F guide · 0.014" wire · pre-dilation · drug-eluting stent</div>
    <div class="disclaimer"><strong>Educational demonstration only.</strong> This simulator is a simplified teaching
      model for medical students. It is <strong>not</strong> clinical training, is not validated for skills assessment,
      and is <strong>not medical advice</strong>. Anatomy, device behaviour and physiology are deliberately simplified.</div>
    <div class="grid2">
      <div>
        <h2>The case</h2>
        <p>${esc(CASE.vignette)}</p>
        <h2>You will</h2>
        <ul>
          <li>Advance a guide catheter from the right wrist to the aortic root under fluoroscopy</li>
          <li>Engage the left main and take a diagnostic angiogram</li>
          <li>Anticoagulate, then steer a guidewire into the LAD and cross the lesion gently</li>
          <li>Pre-dilate with a balloon and watch ischaemia on the monitor</li>
          <li>Size a stent with QCA, deploy it and confirm the result in two projections</li>
          <li>Get a scored debrief with teaching points</li>
        </ul>
      </div>
      <div>
        <h2>Controls</h2>
        ${keysHtml()}
        <p style="font-size:12px;color:var(--muted)">On touch screens use the toolbar and the hold buttons in the device panel.</p>
      </div>
    </div>
    <div class="actions">
      <button class="primary" id="btn-start">Enter the cath lab</button>
      <button id="btn-demo">Watch a demo first</button>
    </div>
  </div>`;
  $('btn-start').addEventListener('click', onStart);
  $('btn-demo').addEventListener('click', onDemo);
  ($('btn-start') as HTMLButtonElement).focus();
}

export function renderHelp(onClose: () => void): void {
  const el = $('help');
  el.innerHTML = `<div class="card" role="dialog" aria-label="Controls">
    <h1>Controls</h1>${keysHtml()}
    <h2>Rules of the lab</h2>
    <ul>
      <li>The guide cannot move while the wire is out; the wire cannot be pulled back while a balloon is on it.</li>
      <li>Balloon/stent sizes can only be changed while the catheter is inside the guide.</li>
      <li>Only one balloon catheter on the wire at a time. Deflate before moving it.</li>
      <li>Locked tools explain why when you hover or press them.</li>
    </ul>
    <div class="actions"><button class="primary" id="help-close">Close (H)</button></div></div>`;
  $('help-close').addEventListener('click', onClose);
}

export function renderPause(onResume: () => void): void {
  $('pause').innerHTML = `<div class="card" style="max-width:420px;text-align:center">
    <h1>Paused</h1><p>The simulation clock is stopped.</p>
    <div class="actions" style="justify-content:center"><button class="primary" id="resume">Resume (Esc)</button></div></div>`;
  $('resume').addEventListener('click', onResume);
}

export function renderDebrief(d: Debrief, onKeep: () => void, onNew: () => void): void {
  const icon = { ok: '✔', warn: '▲', bad: '✖' } as const;
  const ringColor =
    d.grade === 'Excellent' ? 'var(--ok)' : d.grade === 'Good' ? 'var(--accent)' : d.grade === 'Acceptable' ? 'var(--warn)' : 'var(--danger)';
  $('debrief').innerHTML = `<div class="card" role="dialog" aria-labelledby="db-title">
    <h1 id="db-title">Debrief</h1>
    <div class="score">
      <div class="ring" style="border-color:${ringColor}">${d.score}</div>
      <div><div class="grade" style="color:${ringColor}">${esc(d.grade)}</div><div>${esc(d.headline)}</div></div>
    </div>
    <table class="items">${d.items
      .map(
        (i) => `<tr><td class="st ${i.status}-c">${icon[i.status]}</td><td><strong>${esc(i.label)}</strong>
        <div class="teach">${esc(i.teaching)}</div></td><td class="val ${i.status}-c">${esc(i.value)}</td></tr>`,
      )
      .join('')}</table>
    <p style="font-size:12px;color:var(--muted);margin-top:12px">Educational scoring of a simplified model — not a clinical assessment.</p>
    <div class="actions"><button class="primary" id="db-keep">Keep exploring</button><button id="db-new">New case</button></div>
  </div>`;
  $('db-keep').addEventListener('click', onKeep);
  $('db-new').addEventListener('click', onNew);
}
