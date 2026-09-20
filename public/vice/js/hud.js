/**
 * The heads-up display.
 *
 * The felony stars, the radar, the mission line and the card that slams on
 * screen at every act change. It is a game interface bolted to a marketing
 * site, and the joke only works if it behaves like one: the stars light one at
 * a time with a sound, the radar sweeps continuously, and the mission text
 * changes at exactly the scroll position the director says it does.
 *
 * The HUD owns no story state. It is handed a scene each frame and makes the
 * DOM match, which means it cannot drift out of step with the canvas behind
 * it — a class of bug that is otherwise guaranteed on a page like this.
 *
 * @module vice/hud
 */

import { clamp } from './mathkit.js';
import { ACTS, shouldAnnounce } from './sequence.js';
import { railSegments } from './scroll.js';

/** The star, as one path, reused five times. */
const STAR_PATH =
  'M12 2.4l2.9 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.5 6.1 20.6l1.2-6.6-4.9-4.6 6.7-.9z';

/**
 * Build the HUD's markup into the elements it is given.
 *
 * @param {object} nodes `{ stars, rail }` elements to populate.
 */
export function buildHud(nodes) {
  if (nodes.stars) {
    nodes.stars.innerHTML = Array.from({ length: 5 }, (unused, i) => (
      `<svg class="star" data-star="${i}" viewBox="0 0 24 24" aria-hidden="true">` +
      `<path d="${STAR_PATH}"/></svg>`
    )).join('');
    nodes.stars.setAttribute('role', 'img');
  }
  if (nodes.rail) {
    nodes.rail.innerHTML = ACTS.map((act) => (
      `<span class="rail-seg" data-act="${act.id}" style="flex:${(act.to - act.from).toFixed(3)}">` +
      `<i></i><b>${act.chapter}</b></span>`
    )).join('');
  }
}

/**
 * The HUD, driven one frame at a time.
 */
export class Hud {
  /**
   * @param {object} nodes The elements the HUD writes to.
   * @param {object} [options] `{ onAct }` — called when an act begins.
   */
  constructor(nodes, options = {}) {
    this.nodes = nodes;
    this.onAct = options.onAct || (() => {});
    this.act = null;
    this.wanted = 0;
    this.starNodes = nodes.stars ? Array.from(nodes.stars.querySelectorAll('.star')) : [];
    this.segNodes = nodes.rail ? Array.from(nodes.rail.querySelectorAll('.rail-seg')) : [];
    this.sweep = 0;
  }

  /**
   * Make the DOM match a scene.
   *
   * @param {object} scene Scene state from `sequence.sceneState`.
   * @param {number} dt Seconds since the last frame.
   */
  update(scene, dt = 0.016) {
    this.#stars(scene);
    this.#rail(scene);
    this.#radar(scene, dt);

    if (this.nodes.mission && this.nodes.mission.textContent !== scene.mission) {
      this.nodes.mission.textContent = scene.mission;
    }
    if (this.nodes.chapter && this.nodes.chapter.textContent !== scene.chapter) {
      this.nodes.chapter.textContent = scene.chapter;
    }
    if (this.nodes.speed) {
      const mph = Math.round(clamp(scene.speed, 0, 20) * 11);
      const text = `${mph}`;
      if (this.nodes.speed.textContent !== text) this.nodes.speed.textContent = text;
    }

    if (shouldAnnounce(this.act, scene.act)) {
      const previous = this.act;
      this.act = scene.act;
      this.announce(scene);
      this.onAct(scene, previous);
    }
  }

  /** Light the felony stars, and flash the one currently charging. */
  #stars(scene) {
    const level = scene.wanted;
    for (let i = 0; i < this.starNodes.length; i += 1) {
      const star = this.starNodes[i];
      const lit = i < level;
      star.classList.toggle('is-lit', lit);
      star.classList.toggle('is-charging', !lit && i === level && scene.starCharge > 0.05);
      if (!lit && i === level) star.style.setProperty('--charge', scene.starCharge.toFixed(2));
    }
    if (this.nodes.stars) {
      this.nodes.stars.setAttribute(
        'aria-label',
        level ? `Wanted level ${level} of 5` : 'No wanted level',
      );
      this.nodes.stars.classList.toggle('is-max', level >= 5);
    }
    this.wanted = level;
  }

  /** Fill the act rail. */
  #rail(scene) {
    const segments = railSegments(ACTS, scene.p);
    for (let i = 0; i < this.segNodes.length; i += 1) {
      const node = this.segNodes[i];
      const segment = segments[i];
      if (!segment) continue;
      node.style.setProperty('--fill', segment.fill.toFixed(3));
      node.classList.toggle('is-active', segment.active);
    }
  }

  /** The radar: a sweeping arm and a blip per pursuer. */
  #radar(scene, dt) {
    const canvas = this.nodes.radar;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const r = size / 2;
    this.sweep = (this.sweep + dt * 2.4) % (Math.PI * 2);

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(r, r);

    ctx.fillStyle = 'rgba(6,10,14,0.82)';
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(124,227,139,0.35)';
    ctx.lineWidth = 1;
    for (const k of [0.35, 0.68, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, (r - 2) * k, 0, Math.PI * 2);
      ctx.stroke();
    }

    const sweep = ctx.createConicGradient
      ? ctx.createConicGradient(this.sweep, 0, 0)
      : null;
    if (sweep) {
      sweep.addColorStop(0, 'rgba(124,227,139,0.42)');
      sweep.addColorStop(0.12, 'rgba(124,227,139,0)');
      sweep.addColorStop(1, 'rgba(124,227,139,0)');
      ctx.fillStyle = sweep;
      ctx.beginPath();
      ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // You, always at the centre, pointed the way the car is going.
    ctx.fillStyle = '#f6c945';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();

    const blips = [];
    if (scene.police > 0.1) for (let i = 0; i < 3; i += 1) blips.push(['#2a7bff', 1.2 + i * 0.6]);
    if (scene.choppers > 0.1) for (let i = 0; i < 3; i += 1) blips.push(['#7ce38b', 2.3 + i * 0.5]);
    if (scene.tanks > 0.1) blips.push(['#a8b545', 3.4]);
    if (scene.saucer > 0.1) blips.push(['#ff2e88', 4.6]);
    for (let i = 0; i < blips.length; i += 1) {
      const [colour, phase] = blips[i];
      const a = phase + this.sweep * 0.3;
      const d = (r - 8) * (0.35 + ((i * 0.21) % 0.6));
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Slam an act card onto the screen.
   *
   * @param {object} scene Scene state.
   */
  announce(scene) {
    const card = this.nodes.announce;
    if (!card) return;
    const act = ACTS.find((entry) => entry.id === scene.act);
    card.querySelector('.announce-chapter').textContent = act ? act.chapter : '';
    card.querySelector('.announce-line').textContent = scene.mission;
    card.classList.remove('is-up');
    // Force a reflow so the animation restarts even on a back-to-back change.
    void card.offsetWidth;
    card.classList.add('is-up');
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => card.classList.remove('is-up'), 2600);
  }
}
