/**
 * The Augmented Reality bench.
 *
 * The compound lifts out of the vault and stands in the room you are actually
 * in: the device camera becomes the background, the molecule rotates on a fixed
 * plinth in front of it, and its evidence orbits it as panels anchored in three
 * dimensions — every claim with its tier, every study with its design,
 * population, sample size and a link to the literature.
 *
 * Three things make it work on a laptop, an iPhone and an Android alike:
 *
 * - **The camera is optional.** Without one — or when access is declined — the
 *   scene falls back to a studio backdrop and everything else is identical.
 *   Nothing here is gated behind a permission.
 * - **Rotation comes from whatever the device has.** The gyroscope where it
 *   exists and is permitted, a drag everywhere else, and a slow auto-rotate
 *   when neither is being used.
 * - **Panels are DOM, anchored by projection.** They are positioned each frame
 *   from the renderer's own matrix, so they track the molecule exactly while
 *   staying real text — selectable, readable by a screen reader, and with
 *   working links.
 *
 * No frame is uploaded or stored. The camera is read into a canvas for the
 * capture button and discarded; that is the whole of it.
 *
 * @module astra/ar
 */

import { claimStudies, findAny, pubmedUrl } from './data/peptides.js';
import { tier } from './evidence.js';
import { entryReading } from './engine.js';
import { clamp } from './mathkit.js';

/** How far the panel ring sits from the compound's centre. */
const RING_RADIUS = 4.4;

/** The heights panels are distributed across, so they do not stack up. */
const BANDS = [1.9, 0.1, -1.7];

/**
 * Where a panel hangs in the compound's own space.
 *
 * Panels are laid out on a ring at three heights, walking the bands as the
 * index advances so consecutive panels never sit on top of each other. The
 * positions are in model space, which means they rotate *with* the molecule —
 * the data orbits the compound rather than hovering in front of it.
 *
 * @param {number} index Panel index.
 * @param {number} total How many panels there are.
 * @returns {number[]} `[x, y, z]` in model space.
 */
export function anchorFor(index, total) {
  const count = Math.max(1, total);
  const angle = (index / count) * Math.PI * 2;
  const band = BANDS[index % BANDS.length];
  // Panels on the middle band sit slightly further out, so the ring reads as a
  // shallow bowl rather than a cylinder.
  const radius = RING_RADIUS * (band === BANDS[1] ? 1.08 : 1);
  return [Math.cos(angle) * radius, band, Math.sin(angle) * radius];
}

/**
 * Build the data panels for a compound.
 *
 * Order matters: the evidence reading comes first, then what is claimed, then
 * what was actually studied, then the regulatory reality, then the largest
 * unresolved question. Somebody turning the molecule reads the argument in the
 * order the dossier makes it.
 *
 * @param {object|string} subject A compound or stack record, or an id.
 * @returns {Array<object>} Panels, each with an anchor.
 */
export function buildPanels(subject) {
  const entry = typeof subject === 'string' ? findAny(subject) : subject;
  if (!entry) return [];

  const reading = entryReading(entry);
  const isStack = Boolean(entry.members);
  const panels = [];

  panels.push({
    id: 'evidence',
    kind: 'evidence',
    label: 'Evidence',
    title: reading.band.label,
    value: `${Math.round(reading.score * 100)}%`,
    lines: [
      `Best available design: ${reading.best.label}.`,
      `Confidence at this tier is capped at ${Math.round(reading.best.ceiling * 100)}%.`,
    ],
    accent: reading.band.accent,
  });

  for (const claim of (entry.claims || []).slice(0, 4)) {
    const info = tier(claim.tier);
    const cited = claimStudies(entry, claim);
    panels.push({
      id: `claim-${claim.id}`,
      kind: 'claim',
      label: `Claim · ${info.short}`,
      title: claim.text,
      lines: [
        claim.note || info.caveat,
        cited.length
          ? `${cited.length} cited ${cited.length === 1 ? 'study' : 'studies'}.`
          : 'Nothing in the corpus supports this claim. That is the finding.',
      ],
      tier: claim.tier,
      accent: info.accent,
    });
  }

  const studies = isStack
    ? entry.members.flatMap((id) => (findAny(id)?.studies || []).slice(0, 1))
    : entry.studies;

  for (const study of studies.slice(0, 5)) {
    const info = tier(study.tier);
    panels.push({
      id: `study-${study.id}`,
      kind: 'study',
      label: `Study · ${info.short}`,
      title: study.title,
      lines: [
        `${study.journal}, ${study.year} · ${study.design}${study.n ? ` · n=${study.n}` : ''}`,
        `Studied in: ${study.population}`,
        `Found: ${study.finding}`,
        `Limitation: ${study.limitation}`,
      ],
      tier: study.tier,
      accent: info.accent,
      url: pubmedUrl(study),
      cite: `${study.journal}, ${study.year}`,
    });
  }

  panels.push({
    id: 'regulatory',
    kind: 'regulatory',
    label: 'Regulatory',
    title: isStack ? 'Governed by its strictest component' : entry.regulatory.headline,
    lines: isStack
      ? [entry.evidenceNote]
      : [entry.regulatory.detail, `In sport: ${entry.regulatory.sport}`],
    accent: entry.regulatory?.status === 'approved' ? '#2fe08a' : '#ff9d5c',
  });

  const uncertainty = (entry.uncertainties || [])[0];
  if (uncertainty) {
    panels.push({
      id: 'uncertainty',
      kind: 'uncertainty',
      label: 'Open question',
      title: 'What is not settled',
      lines: [uncertainty],
      accent: '#f2b53b',
    });
  }

  return panels.map((panel, index) => ({ ...panel, anchor: anchorFor(index, panels.length) }));
}

/**
 * How visible a panel should be at a given projected depth.
 *
 * Panels on the far side of the compound fade rather than drawing through it,
 * which is what stops the ring reading as a flat overlay. `depth` is the
 * distance in front of the camera, so it is compared against where the camera
 * is actually sitting: a panel level with the compound's centre is fully
 * opaque, one a ring-radius behind it has gone.
 *
 * @param {{ depth: number, visible: boolean }} projected A projection result.
 * @param {number} [reference] The camera's distance from the compound.
 * @returns {number} Opacity in [0, 1].
 */
export function panelOpacity(projected, reference = 7.4, falloff = 1.5) {
  if (!projected.visible || projected.depth <= 0) return 0;
  // -1 at the near edge of the ring, +1 at the far edge.
  const relative = (projected.depth - reference) / RING_RADIUS;
  return clamp(1 - (relative + 0.15) * falloff, 0, 1);
}

/**
 * The free area of the screen: everything the console is not covering.
 *
 * The compound is centred here and the panels are confined to it, which is why
 * the bench works identically on a laptop, where the console is a column down
 * the right, and on a phone, where it is a sheet across the bottom.
 *
 * @param {object} [options] Measurements, injected so this is testable.
 * @param {number} options.width Viewport width.
 * @param {number} options.height Viewport height.
 * @param {DOMRect|null} [options.panel] The console panel's rect, if shown.
 * @param {number} [options.top] Height of the top bar.
 * @param {number} [options.bottom] Height of the deck navigation.
 * @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number, cx: number, cy: number }} The stage.
 */
export function stageRect({ width, height, panel = null, top = 58, bottom = 70 }) {
  let left = 0;
  let right = width;
  let stageTop = top;
  let stageBottom = height - bottom;

  if (panel && panel.width > 0 && panel.height > 0) {
    // A panel occupying most of the width is a bottom sheet; one that does not
    // is a side column. Which it is decides which edge it takes away.
    if (panel.width > width * 0.7) stageBottom = Math.min(stageBottom, panel.top);
    else if (panel.left > width * 0.5) right = Math.min(right, panel.left);
    else left = Math.max(left, panel.right);
  }

  const stageWidth = Math.max(80, right - left);
  const stageHeight = Math.max(80, stageBottom - stageTop);
  return {
    left,
    top: stageTop,
    right: left + stageWidth,
    bottom: stageTop + stageHeight,
    width: stageWidth,
    height: stageHeight,
    cx: left + stageWidth / 2,
    cy: stageTop + stageHeight / 2,
  };
}

/**
 * How many panels a stage can show at once without becoming a wall of text.
 *
 * Fading the back half is not enough on a phone: four panels in a 360-pixel
 * stage cover the compound entirely, which defeats the point of putting it in
 * your room. So the stage gets a hard budget and only the nearest panels spend
 * it — the rest wait their turn as the compound rotates.
 *
 * @param {{ width: number, height: number }} stage The stage rect.
 * @returns {number} How many panels may be visible.
 */
export function maxVisiblePanels(stage) {
  // How many panel-sized tiles the stage holds, as a grid rather than a line:
  // a wide short stage and a narrow tall one both hold more than either
  // dimension alone suggests.
  const columns = Math.floor(stage.width / 215);
  const rows = Math.floor(stage.height / 165);
  return clamp(columns * rows, 2, 6);
}

/**
 * The AR scene controller.
 */
export class ARScene {
  /**
   * @param {object} options Wiring.
   * @param {HTMLVideoElement} options.video The camera element.
   * @param {HTMLElement} options.layer Where panels are appended.
   * @param {object} options.lab The renderer.
   * @param {object} options.lens The camera wrapper from `sensors.js`.
   * @param {object} options.tilt The device-orientation wrapper.
   * @param {(panel: object) => void} [options.onFocus] Called when a panel is opened.
   */
  constructor({ video, layer, lab, lens, tilt, onFocus }) {
    this.video = video;
    this.layer = layer;
    this.lab = lab;
    this.lens = lens;
    this.tilt = tilt;
    this.onFocus = onFocus;
    this.panels = [];
    this.nodes = new Map();
    this.entry = null;
    this.running = false;
    this.cameraOn = false;
    this.facing = 'environment';
    this.useGyro = false;
    this.drag = null;
    this.yaw = 0;
    this.pitch = 0;
  }

  /**
   * Show a compound.
   *
   * @param {object|string} subject A compound, stack, or id.
   */
  setCompound(subject) {
    const entry = typeof subject === 'string' ? findAny(subject) : subject;
    if (!entry) return;
    this.entry = entry;
    this.panels = buildPanels(entry);
    this.lab?.setCompound(entry.id, entry.accent);
    this.#buildNodes();
  }

  /** Build one DOM node per panel, reusing the layer. */
  #buildNodes() {
    this.layer.replaceChildren();
    this.nodes.clear();
    for (const panel of this.panels) {
      const node = document.createElement('article');
      node.className = `ar-panel ar-${panel.kind}`;
      node.style.setProperty('--accent', panel.accent);
      node.tabIndex = 0;
      node.setAttribute('role', 'button');

      const label = document.createElement('span');
      label.className = 'ar-panel-label';
      label.textContent = panel.label;

      const title = document.createElement('h4');
      title.textContent = panel.title;

      node.append(label, title);

      if (panel.value) {
        const value = document.createElement('span');
        value.className = 'ar-panel-value';
        value.textContent = panel.value;
        node.append(value);
      }

      const first = document.createElement('p');
      first.textContent = panel.lines[0] || '';
      node.append(first);

      const open = () => this.onFocus?.(panel);
      node.addEventListener('click', open);
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });

      this.layer.append(node);
      this.nodes.set(panel.id, node);
    }
  }

  /**
   * Start the camera.
   *
   * @param {'environment'|'user'} [facing] Which camera.
   * @returns {Promise<boolean>} Whether a stream started.
   */
  async startCamera(facing = this.facing) {
    this.facing = facing;
    const started = await this.lens.start(facing);
    this.cameraOn = started;
    this.video.classList.toggle('live', started);
    // The front camera is mirrored, because an unmirrored selfie view is
    // disorienting to everyone who has ever used a phone.
    this.video.classList.toggle('mirrored', started && facing === 'user');
    return started;
  }

  /** Stop the camera and return to the studio backdrop. */
  stopCamera() {
    this.lens.stop();
    this.cameraOn = false;
    this.video.classList.remove('live', 'mirrored');
  }

  /**
   * Swap between the front and rear cameras.
   *
   * @returns {Promise<boolean>} Whether the new stream started.
   */
  async flipCamera() {
    return this.startCamera(this.facing === 'environment' ? 'user' : 'environment');
  }

  /**
   * Turn gyroscope rotation on, asking permission where the platform needs it.
   *
   * @returns {Promise<boolean>} Whether the gyroscope is now driving rotation.
   */
  async enableGyro() {
    const result = await this.tilt.enableMotion();
    this.useGyro = Boolean(result.granted);
    return this.useGyro;
  }

  /**
   * Attach drag-to-rotate to an element.
   *
   * @param {HTMLElement} surface The element to listen on.
   */
  bindDrag(surface) {
    surface.addEventListener('pointerdown', (event) => {
      this.drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
      surface.setPointerCapture?.(event.pointerId);
      this.lab.drag = this.drag;
    });
    surface.addEventListener('pointermove', (event) => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      this.yaw += (event.clientX - this.drag.x) * 0.008;
      this.pitch = clamp(this.pitch + (event.clientY - this.drag.y) * 0.006, -1.1, 1.1);
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.useGyro = false;
    });
    const release = (event) => {
      if (this.drag?.id !== event.pointerId) return;
      this.drag = null;
      this.lab.drag = null;
    };
    surface.addEventListener('pointerup', release);
    surface.addEventListener('pointercancel', release);
  }

  /**
   * Set whether the compound turns on its own.
   *
   * @param {boolean} on Whether to auto-rotate.
   */
  setAutoSpin(on) {
    this.lab.ar.autoSpin = Boolean(on);
  }

  /** Enter AR and begin positioning panels. */
  start() {
    if (this.running) return;
    this.running = true;
    this.lab.setAR(true);
    const step = () => {
      if (!this.running) return;
      this.#position();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Leave AR, release the camera and restore the vault. */
  stop() {
    this.running = false;
    this.stopCamera();
    this.lab.setAR(false);
  }

  /**
   * Measure the free area, from the live DOM.
   *
   * @returns {object} The stage rect.
   */
  stage() {
    const panel = document.getElementById('panel');
    const shown = panel && getComputedStyle(panel).opacity !== '0';
    return stageRect({
      width: window.innerWidth,
      height: window.innerHeight,
      panel: shown ? panel.getBoundingClientRect() : null,
    });
  }

  /** Position every panel from the renderer's current matrix. */
  #position() {
    if (this.useGyro) {
      // Gyroscope drives rotation directly, scaled so a comfortable wrist
      // movement covers a full turn rather than a twitch.
      this.lab.setARSpin(this.yaw + this.tilt.x * 1.9, this.pitch + this.tilt.y * 0.7);
    } else {
      this.lab.setARSpin(this.yaw, this.pitch);
    }

    // Centre the compound in whatever the console has left free, by moving the
    // camera rather than the model.
    const stage = this.stage();
    const perPixel = this.lab.worldPerPixel();
    this.lab.setARFraming(
      (window.innerWidth / 2 - stage.cx) * perPixel,
      (stage.cy - window.innerHeight / 2) * perPixel,
    );
    // A cramped stage gets a steeper fade, so fewer panels compete for it.
    const falloff = stage.width < 520 ? 2.6 : 1.5;
    const budget = maxVisiblePanels(stage);

    // Project everything first, then spend the stage's budget on the panels
    // nearest the viewer. Deciding per panel in isolation is what lets four of
    // them end up stacked on a phone.
    const projections = this.panels.map((panel) => ({
      panel,
      node: this.nodes.get(panel.id),
      projected: this.lab.project(panel.anchor),
    }));
    const ranked = projections
      .filter((item) => item.node && panelOpacity(item.projected, this.lab.ar.distance, falloff) > 0.02)
      .sort((a, b) => a.projected.depth - b.projected.depth)
      .slice(0, budget);
    const shown = new Set(ranked.map((item) => item.panel.id));

    for (const { panel, node, projected } of projections) {
      if (!node) continue;
      const opacity = shown.has(panel.id)
        ? panelOpacity(projected, this.lab.ar.distance, falloff)
        : 0;
      if (opacity <= 0.02) {
        node.style.opacity = '0';
        node.style.pointerEvents = 'none';
        continue;
      }
      // A panel close to the camera projects a long way out — far enough to
      // leave the viewport, where it is just a thing the reader can tell is
      // missing. Clamping keeps every visible panel readable while it still
      // tracks the rotation.
      const bounds = node.getBoundingClientRect();
      const marginX = (bounds.width || 200) / 2 + 8;
      const marginY = (bounds.height || 90) / 2 + 8;
      const x = clamp(projected.x, stage.left + marginX, Math.max(stage.left + marginX, stage.right - marginX));
      const y = clamp(projected.y, stage.top + marginY, Math.max(stage.top + marginY, stage.bottom - marginY));

      node.style.opacity = opacity.toFixed(2);
      node.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
      node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(0.82 + opacity * 0.22).toFixed(3)})`;
      node.style.zIndex = String(Math.round((30 - projected.depth) * 20));
    }
  }

  /**
   * Composite the current view into a shareable image.
   *
   * Video, then the rendered compound, then the panels drawn as text — the
   * panels are DOM and cannot be rasterised directly, so they are re-drawn onto
   * the canvas at the positions they occupy on screen. The result is a card
   * that carries the citation rather than just the pretty object.
   *
   * @returns {Promise<string|null>} A PNG data URL, or null if nothing rendered.
   */
  capture() {
    return new Promise((resolve) => {
      const canvas = this.lab.canvas;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) {
        resolve(null);
        return;
      }

      // The composite has to happen in the same turn the frame was drawn, or
      // the WebGL drawing buffer has already been cleared.
      this.lab.onAfterFrame(() => {
        const out = document.createElement('canvas');
        const scale = Math.min(2, globalThis.devicePixelRatio || 1);
        out.width = Math.round(width * scale);
        out.height = Math.round(height * scale);
        const ctx = out.getContext('2d');
        ctx.scale(scale, scale);

        ctx.fillStyle = '#03060c';
        ctx.fillRect(0, 0, width, height);

        if (this.cameraOn && this.video.videoWidth) {
          drawCover(ctx, this.video, width, height, this.facing === 'user');
        }

        try {
          ctx.drawImage(canvas, 0, 0, width, height);
        } catch {
          // A tainted or zero-size buffer; the card still carries the data.
        }

        this.#drawPanels(ctx, width, height);
        this.#drawFooter(ctx, width, height);

        resolve(out.toDataURL('image/png'));
      });
    });
  }

  /**
   * Draw the visible panels onto a capture canvas.
   *
   * @param {CanvasRenderingContext2D} ctx Target context.
   * @param {number} width Canvas width in CSS pixels.
   * @param {number} height Canvas height in CSS pixels.
   */
  #drawPanels(ctx, width, height) {
    for (const panel of this.panels) {
      const projected = this.lab.project(panel.anchor);
      const opacity = panelOpacity(projected, this.lab.ar.distance);
      if (opacity < 0.55) continue;

      const boxWidth = Math.min(250, width * 0.42);
      const x = clamp(projected.x - boxWidth / 2, 8, Math.max(8, width - boxWidth - 8));
      const y = clamp(projected.y - 34, 8, Math.max(8, height - 110));

      ctx.globalAlpha = opacity;
      ctx.fillStyle = 'rgba(5, 10, 20, 0.82)';
      ctx.strokeStyle = panel.accent;
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, boxWidth, 72, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = panel.accent;
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.fillText(panel.label.toUpperCase(), x + 12, y + 20);

      ctx.fillStyle = '#eaf2ff';
      ctx.font = '600 12px system-ui, sans-serif';
      wrapText(ctx, panel.title, x + 12, y + 38, boxWidth - 24, 14, 2);

      if (panel.cite) {
        ctx.fillStyle = '#93a6c4';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(panel.cite, x + 12, y + 64);
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Draw the identity and disclosure band along the bottom of a capture.
   *
   * @param {CanvasRenderingContext2D} ctx Target context.
   * @param {number} width Canvas width in CSS pixels.
   * @param {number} height Canvas height in CSS pixels.
   */
  #drawFooter(ctx, width, height) {
    const reading = entryReading(this.entry);
    const band = 66;
    ctx.fillStyle = 'rgba(3, 6, 12, 0.88)';
    ctx.fillRect(0, height - band, width, band);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    ctx.beginPath();
    ctx.moveTo(0, height - band);
    ctx.lineTo(width, height - band);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText(this.entry.name, 16, height - band + 26);

    ctx.fillStyle = reading.band.accent;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`${reading.band.label} · ${Math.round(reading.score * 100)}%  ·  best design: ${reading.best.label}`,
      16, height - band + 44);

    ctx.fillStyle = '#63758f';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText('Educational information about published research. Not medical advice, not a recommendation.',
      16, height - band + 58);
  }
}

/**
 * Draw a video frame cropped to fill a box, the way `object-fit: cover` does.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {HTMLVideoElement} video Source video.
 * @param {number} width Box width.
 * @param {number} height Box height.
 * @param {boolean} mirror Whether to flip horizontally.
 */
export function drawCover(ctx, video, width, height, mirror = false) {
  const videoRatio = video.videoWidth / video.videoHeight;
  const boxRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (videoRatio > boxRatio) drawWidth = height * videoRatio;
  else drawHeight = width / videoRatio;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  ctx.save();
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, x, y, drawWidth, drawHeight);
  ctx.restore();
}

/**
 * A rounded rectangle path.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {number} x Left.
 * @param {number} y Top.
 * @param {number} width Width.
 * @param {number} height Height.
 * @param {number} radius Corner radius.
 */
export function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/**
 * Draw text wrapped to a width, truncating with an ellipsis.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {string} text The text.
 * @param {number} x Left.
 * @param {number} y Baseline of the first line.
 * @param {number} maxWidth Wrap width.
 * @param {number} lineHeight Line spacing.
 * @param {number} maxLines How many lines before truncating.
 */
export function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let drawn = 0;
  for (let i = 0; i < words.length; i += 1) {
    const candidate = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(candidate).width > maxWidth && line) {
      drawn += 1;
      if (drawn === maxLines) {
        ctx.fillText(`${line}…`, x, y);
        return;
      }
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = words[i];
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, x, y);
}
