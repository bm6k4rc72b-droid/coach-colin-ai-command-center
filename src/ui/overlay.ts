/**
 * Canvas overlay drawing.
 *
 * Kept as a plain function over a 2D context rather than React elements: this
 * runs once per frame at up to 60fps, and reconciling a virtual DOM at that
 * rate for a dozen boxes would cost more than the detector does.
 */

import type { TrackedPlayer } from '../vision/players.ts';
import type { Point } from '../vision/homography.ts';

const TEAM_COLOURS = ['#3d7bff', '#ffc42e'] as const;
const QB_COLOUR = '#ff3b3b';
const UNASSIGNED_COLOUR = '#9aa4b2';

export type OverlayInput = {
  players: TrackedPlayer[];
  quarterbackId: number | null;
  calibrationPoints: Point[];
  targetPoint: Point | null;
};

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: OverlayInput,
): void {
  ctx.clearRect(0, 0, width, height);

  // Scale line weights and text to the frame so the overlay reads the same on a
  // 720p preview and a 1080p capture.
  const unit = Math.max(1, Math.round(width / 640));

  drawCalibration(ctx, input.calibrationPoints, unit);

  for (const player of input.players) {
    const isQb = player.id === input.quarterbackId;
    const colour = isQb
      ? QB_COLOUR
      : player.team === null
        ? UNASSIGNED_COLOUR
        : TEAM_COLOURS[player.team];

    drawPlayerBox(ctx, player, colour, unit, isQb);
  }

  if (input.targetPoint) drawTarget(ctx, input.targetPoint, unit);
}

function drawPlayerBox(
  ctx: CanvasRenderingContext2D,
  player: TrackedPlayer,
  colour: string,
  unit: number,
  emphasised: boolean,
): void {
  const { x, y, width, height } = player.box;

  ctx.lineWidth = emphasised ? unit * 2.5 : unit * 1.5;
  ctx.strokeStyle = colour;
  ctx.strokeRect(x, y, width, height);

  const label = `PID:${player.id}${player.team === null ? '' : ` TID:${player.team + 1}`}`;
  const fontSize = unit * 9;
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const padding = unit * 3;
  const boxHeight = fontSize + padding;

  ctx.fillStyle = colour;
  ctx.fillRect(x, Math.max(0, y - boxHeight), textWidth + padding * 2, boxHeight);

  ctx.fillStyle = '#0b0f16';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + padding, Math.max(0, y - boxHeight) + boxHeight / 2);
}

function drawCalibration(ctx: CanvasRenderingContext2D, points: Point[], unit: number): void {
  if (points.length === 0) return;

  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = unit * 1.5;
  ctx.setLineDash([unit * 4, unit * 3]);

  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (points.length === 4) ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  points.forEach((p, i) => {
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(p.x, p.y, unit * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#04140a';
    ctx.font = `700 ${unit * 8}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), p.x, p.y);
    ctx.textAlign = 'start';
  });
}

function drawTarget(ctx: CanvasRenderingContext2D, point: Point, unit: number): void {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = unit * 2;

  ctx.beginPath();
  ctx.arc(point.x, point.y, unit * 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(point.x - unit * 12, point.y);
  ctx.lineTo(point.x + unit * 12, point.y);
  ctx.moveTo(point.x, point.y - unit * 12);
  ctx.lineTo(point.x, point.y + unit * 12);
  ctx.stroke();
}
