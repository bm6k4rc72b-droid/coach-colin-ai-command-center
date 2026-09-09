/**
 * Drawing the analysis over the footage, and drawing only what was measured.
 *
 * This is the part people screenshot, which makes it the part most likely to
 * mislead. The overlay in the post that started this app tags every player with
 * a speed, draws pass lanes with completion percentages, and prints a
 * possession bar — over footage where half those players are four pixels tall
 * and the ball is not visible in the frame. It looks like telemetry. It is
 * typography.
 *
 * The rule here is that nothing is drawn unless the number behind it exists.
 * A player who has not been tracked long enough for a speed shows no speed. A
 * pass lane appears only when there is a player on the ball to pass from. The
 * possession strip prints the share of time that could not be attributed
 * alongside the two teams. When calibration is stale, every metric on screen is
 * struck through, because the metres stopped meaning anything the moment the
 * camera moved.
 *
 * Everything is drawn in pitch coordinates and projected back through the
 * homography, so a tag sits on the grass rather than floating over it, and
 * moves correctly as the perspective changes across the frame.
 *
 * @module touchline/overlay
 */

import { apply, pitchLines } from './pitch.js';

/** Colours the overlay draws with. */
export const INK = Object.freeze({
  home: '#4da3ff',
  away: '#ff6b57',
  other: '#c7d0dc',
  ball: '#ffe14d',
  lane: '#6ef2b0',
  laneScreened: '#ff8a6b',
  model: 'rgba(110, 242, 176, 0.35)',
  warn: '#ffb020',
  ink: '#f2f5f8',
  shade: 'rgba(6, 10, 14, 0.72)',
});

/** Project a pitch point into image pixels, or null if it is behind us. */
function toImage(pitchToImage, point) {
  const at = apply(pitchToImage, point);
  return at.w > 0 ? at : null;
}

/**
 * Draw the fitted pitch model over the footage.
 *
 * This is the only calibration check a person can actually make: if the drawn
 * lines lie on the painted ones, the homography is right, and if they drift
 * away at one end, it is not. It is worth more than the residual figure beside
 * it, because it shows *where* the fit is wrong.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {number[]} pitchToImage Row-major 3x3.
 * @param {{lengthM: number, widthM: number}} dimensions Pitch size.
 * @param {string} [colour=INK.model] Stroke colour.
 */
export function drawPitchModel(ctx, pitchToImage, dimensions, colour = INK.model) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (const line of pitchLines(dimensions)) {
    const a = toImage(pitchToImage, line.a);
    const b = toImage(pitchToImage, line.b);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a rounded label anchored above a point.
 *
 * Two players standing near each other produce two labels in the same few
 * pixels, and on a crowded pitch that is most of them: the overlay turns into a
 * pile of half-covered numbers, which is worse than no numbers because it is
 * unclear which one belongs to whom. So a label that would land on one already
 * drawn is lifted above it, and one that would run off the side of the frame is
 * pulled back in — a tag half off the picture reads as a different figure.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {number} x Anchor column.
 * @param {number} y Anchor row.
 * @param {string} text Label text.
 * @param {string} colour Accent colour.
 * @param {number} [scale=1] Display scale for sizing.
 * @param {{left: number, top: number, right: number, bottom: number}[]} [placed]
 *   Labels already drawn this frame; the new one avoids them and is added.
 * @returns {{left: number, top: number, right: number, bottom: number}} Where
 *   the label ended up.
 */
export function drawTag(ctx, x, y, text, colour, scale = 1, placed = null) {
  const fontSize = Math.max(9, 10 * scale);
  ctx.font = `600 ${fontSize}px ui-monospace, "SF Mono", Menlo, monospace`;
  const padding = fontSize * 0.42;
  const width = ctx.measureText(text).width + padding * 2;
  const height = fontSize + padding * 1.4;
  const limit = ctx.canvas?.width ?? Infinity;
  let left = Math.max(2, Math.min(x - width / 2, limit - width - 2));
  let top = y - height;
  if (placed) {
    const hits = (box) =>
      placed.some(
        (other) =>
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top,
      );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const box = { left, top, right: left + width, bottom: top + height };
      if (!hits(box)) break;
      top -= height + 2;
    }
    placed.push({ left, top, right: left + width, bottom: top + height });
  }
  const centre = left + width / 2;
  ctx.fillStyle = INK.shade;
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, 3);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.fillRect(left, top, 2.5, height);
  ctx.fillStyle = INK.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, centre, top + height / 2 + 0.5);
  return { left, top, right: left + width, bottom: top + height };
}

/**
 * Draw the players: a marker at their feet, and a tag with what is known.
 *
 * The speed only appears once a player has been tracked long enough for the
 * speed window to have filled. Printing 0 km/h for a player who has been on
 * screen for two frames is a measurement claim the app has not earned.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {object[]} players Tracks to draw.
 * @param {number[]} pitchToImage Row-major 3x3.
 * @param {object} [options] Drawing options.
 * @param {number} [options.scale=1] Display scale.
 * @param {number|null} [options.carrierId=null] Player in possession.
 * @param {boolean} [options.showSpeed=true] Whether to tag speeds.
 * @param {boolean} [options.stale=false] Whether calibration has gone stale.
 */
export function drawPlayers(ctx, players, pitchToImage, options = {}) {
  const scale = options.scale ?? 1;
  const carrierId = options.carrierId ?? null;
  const showSpeed = options.showSpeed !== false;
  const stale = options.stale ?? false;
  const placed = options.placed ?? [];
  ctx.save();
  // Nearest the camera first, so when labels collide the ones lifted clear are
  // the distant players rather than the ones being watched.
  const ordered = [...players].sort((a, b) => b.y - a.y);
  for (const player of ordered) {
    const at = toImage(pitchToImage, player);
    if (!at) continue;
    const colour = INK[player.team] ?? INK.other;
    const radius = Math.max(3, 4 * scale);

    // A shadow ellipse on the grass, not a box round the body: the position
    // this app knows is the player's feet, and the marker should say so.
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, radius * 1.6, radius * 0.7, 0, 0, Math.PI * 2);
    ctx.strokeStyle = colour;
    ctx.lineWidth = player.id === carrierId ? 2.5 : 1.4;
    ctx.stroke();

    if (player.id === carrierId) {
      ctx.beginPath();
      ctx.ellipse(at.x, at.y, radius * 2.6, radius * 1.15, 0, 0, Math.PI * 2);
      ctx.strokeStyle = INK.ball;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    const parts = [player.label];
    if (showSpeed && player.speedMps > 0 && !player.contested) {
      parts.push(`${(player.speedMps * 3.6).toFixed(1)} km/h`);
    }
    if (player.contested) parts.push('merged');
    if (stale) parts.push('uncalibrated');
    drawTag(ctx, at.x, at.y - radius * 1.4, parts.join('  '), colour, scale, placed);
  }
  ctx.restore();
}

/**
 * Draw the ball, or the fact that it is missing.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{visible: boolean, x: number, y: number, speedMps: number}} ball Ball.
 * @param {number[]} pitchToImage Row-major 3x3.
 * @param {number} [scale=1] Display scale.
 */
export function drawBall(ctx, ball, pitchToImage, scale = 1) {
  if (!ball || !ball.visible) return;
  const at = toImage(pitchToImage, ball);
  if (!at) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(at.x, at.y, Math.max(3, 4 * scale), 0, Math.PI * 2);
  ctx.strokeStyle = INK.ball;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (ball.speedMps > 1) {
    drawTag(ctx, at.x, at.y - 8 * scale, `${ball.speedMps.toFixed(1)} m/s`, INK.ball, scale * 0.9);
  }
  ctx.restore();
}

/**
 * Draw the pass options available to the player on the ball.
 *
 * A clear lane is drawn solid, a screened one dashed with the screening player
 * marked on it. The label carries metres, not a probability — see
 * `passing.js` for why there is no percentage here.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{x: number, y: number}} carrier Player in possession.
 * @param {object[]} options Options from `passOptions`.
 * @param {number[]} pitchToImage Row-major 3x3.
 * @param {number} [scale=1] Display scale.
 */
export function drawPassLanes(ctx, carrier, options, pitchToImage, scale = 1, placed = null) {
  const from = toImage(pitchToImage, carrier);
  if (!from) return;
  ctx.save();
  for (const option of options) {
    const to = toImage(pitchToImage, option.to);
    if (!to) continue;
    ctx.beginPath();
    ctx.setLineDash(option.screened ? [4, 4] : []);
    ctx.strokeStyle = option.screened ? INK.laneScreened : INK.lane;
    ctx.lineWidth = option.screened ? 1 : 1.6;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const label = option.screened
      ? `${option.lengthM.toFixed(0)} m · screened ${option.clearanceM.toFixed(1)} m`
      : `${option.lengthM.toFixed(0)} m · clear ${option.clearanceM.toFixed(1)} m`;
    drawTag(
      ctx,
      midX,
      midY,
      option.closing ? `${label} · closing` : label,
      option.screened ? INK.laneScreened : INK.lane,
      scale * 0.85,
      placed,
    );
  }
  ctx.restore();
}

/**
 * Draw the strip of match-wide figures across the bottom of the frame.
 *
 * Every cell carries its own caveat in small type. That is the difference
 * between this strip and the one it is modelled on: "81%" alone is a claim
 * about the match, "81% of 34 s attributed" is a claim about the footage.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {{label: string, value: string, note: string, accent?: string}[]} cells
 *   Cells, left to right.
 * @param {number} width Canvas width.
 * @param {number} height Canvas height.
 * @param {number} [scale=1] Display scale.
 */
export function drawStrip(ctx, cells, width, height, scale = 1) {
  if (!cells.length) return;
  const stripHeight = Math.max(38, 46 * scale);
  const top = height - stripHeight;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 10, 14, 0.82)';
  ctx.fillRect(0, top, width, stripHeight);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, top, width, 1);
  const cellWidth = width / cells.length;
  cells.forEach((cell, index) => {
    const x = index * cellWidth + 10 * scale;
    if (index > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(index * cellWidth, top + 6, 1, stripHeight - 12);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.font = `600 ${Math.max(7, 8 * scale)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(cell.label.toUpperCase(), x, top + 14 * scale);
    ctx.fillStyle = cell.accent ?? INK.ink;
    ctx.font = `700 ${Math.max(12, 15 * scale)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(cell.value, x, top + 29 * scale);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.font = `400 ${Math.max(7, 8 * scale)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(cell.note, x, top + 40 * scale);
  });
  ctx.restore();
}

/**
 * Draw the plan view: the pitch from above, with everyone on it.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {object} scene What to draw.
 * @param {object[]} scene.players Players.
 * @param {object} [scene.ball] Ball state.
 * @param {object} [scene.grid] Control grid from `space.controlGrid`.
 * @param {{lengthM: number, widthM: number}} scene.dimensions Pitch size.
 * @param {number} scene.width Canvas width.
 * @param {number} scene.height Canvas height.
 * @param {object[]} [scene.trails] Paths to draw behind the players.
 */
export function drawPlan(ctx, scene) {
  const { players, ball, grid, dimensions, width, height, trails = [] } = scene;
  const margin = 8;
  const scale = Math.min(
    (width - margin * 2) / dimensions.lengthM,
    (height - margin * 2) / dimensions.widthM,
  );
  const originX = (width - dimensions.lengthM * scale) / 2;
  const originY = (height - dimensions.widthM * scale) / 2;
  const px = (x) => originX + x * scale;
  const py = (y) => originY + y * scale;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0d1a12';
  ctx.fillRect(px(0), py(0), dimensions.lengthM * scale, dimensions.widthM * scale);

  if (grid) {
    // Territory first, underneath everything, at low opacity: it is context,
    // not a headline.
    const cellW = (grid.cellW ?? grid.cellM) * scale;
    const cellH = (grid.cellH ?? grid.cellM) * scale;
    for (let row = 0; row < grid.rows; row += 1) {
      for (let col = 0; col < grid.cols; col += 1) {
        const team = grid.team[row * grid.cols + col];
        if (!team) continue;
        ctx.fillStyle =
          team === 1 ? 'rgba(77, 163, 255, 0.16)' : team === 2 ? 'rgba(255, 107, 87, 0.16)' : 'rgba(199, 208, 220, 0.08)';
        ctx.fillRect(px(col * (grid.cellW ?? grid.cellM)), py(row * (grid.cellH ?? grid.cellM)), cellW + 0.5, cellH + 0.5);
      }
    }
  }

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const line of pitchLines(dimensions)) {
    ctx.moveTo(px(line.a.x), py(line.a.y));
    ctx.lineTo(px(line.b.x), py(line.b.y));
  }
  ctx.stroke();

  for (const trail of trails) {
    if (!trail.path || trail.path.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = INK[trail.team] ?? INK.other;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.moveTo(px(trail.path[0].x), py(trail.path[0].y));
    for (const point of trail.path.slice(1)) ctx.lineTo(px(point.x), py(point.y));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const player of players) {
    ctx.beginPath();
    ctx.fillStyle = INK[player.team] ?? INK.other;
    ctx.arc(px(player.x), py(player.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (player.vx || player.vy) {
      ctx.beginPath();
      ctx.strokeStyle = INK[player.team] ?? INK.other;
      ctx.lineWidth = 1;
      ctx.moveTo(px(player.x), py(player.y));
      ctx.lineTo(px(player.x + player.vx * 0.7), py(player.y + player.vy * 0.7));
      ctx.stroke();
    }
  }

  if (ball && ball.visible) {
    ctx.beginPath();
    ctx.fillStyle = INK.ball;
    ctx.arc(px(ball.x), py(ball.y), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
