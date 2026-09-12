/**
 * The cast.
 *
 * Everything with a name in this film is drawn here, as vector paths on a 2D
 * canvas: a man walking, a white Rolls with red rims, armoured police
 * Chargers, gunships, armour, a gold truck, a saucer, and the shield that ends
 * the picture.
 *
 * They are drawn rather than photographed for the same reasons the city is
 * generated — weight, and control. A sprite sheet with this many actors at
 * retina resolution is megabytes; these are functions. And because a car is a
 * path rather than an image, the same Rolls can be lit by a sunset in one act
 * and by a fireball in another without a second asset.
 *
 * Every function draws in its own local space, centred on `(x, y)` at the
 * given `scale`, and restores the context it was handed.
 *
 * @module vice/actors
 */

import { clamp, css, mix } from './mathkit.js';

/** The white Rolls, its rims, and the black aero it was fitted with. */
const CAR = Object.freeze({
  body: '#f4f1ea',
  shadow: '#cfc9bd',
  glass: '#1a2230',
  aero: '#0b0b0d',
  rim: '#d81f2a',
  tyre: '#101014',
  chrome: '#e8e4d8',
});

/**
 * Tommy, on foot.
 *
 * A six-frame walk described as angles rather than drawn as frames: hips and
 * shoulders counter-rotate, the trailing arm swings against the leading leg,
 * and the whole body rises a little on each push-off. It reads as a walk from
 * across a street, which is the only distance it is ever seen from.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Ground position.
 * @param {number} y Ground line.
 * @param {number} scale Body height in pixels ÷ 100.
 * @param {object} [state] `{ phase, down, alpha }`.
 */
export function drawTommy(ctx, x, y, scale, state = {}) {
  const { phase = 0, down = 0, alpha = 1 } = state;
  if (alpha <= 0.01) return;
  const swing = Math.sin(phase);
  const lift = Math.abs(Math.cos(phase)) * 2.2;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Knocked flat: the whole figure rotates to the ground rather than being a
  // second, differently-proportioned drawing.
  if (down > 0) {
    ctx.translate(0, -6 * (1 - down));
    ctx.rotate(-Math.PI / 2 * down);
    ctx.translate(0, 34 * down);
  }

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const legSwing = down > 0.5 ? 0.5 : swing;
  // Legs — dark trousers.
  ctx.strokeStyle = '#16171f';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -46 + lift);
  ctx.lineTo(legSwing * 11, -2);
  ctx.moveTo(0, -46 + lift);
  ctx.lineTo(-legSwing * 11, -2);
  ctx.stroke();

  // Torso — the Hawaiian shirt, in stripes so it reads at any size.
  ctx.fillStyle = '#39c6d6';
  ctx.beginPath();
  ctx.roundRect(-11, -84 + lift, 22, 40, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 3; i += 1) ctx.fillRect(-11, -78 + lift + i * 11, 22, 3);
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.moveTo(-4, -84 + lift);
  ctx.lineTo(0, -70 + lift);
  ctx.lineTo(4, -84 + lift);
  ctx.closePath();
  ctx.fill();

  // Arms.
  ctx.strokeStyle = '#c08a63';
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.moveTo(-8, -80 + lift);
  ctx.lineTo(-8 - swing * 10, -54 + lift);
  ctx.moveTo(8, -80 + lift);
  ctx.lineTo(8 + swing * 10, -54 + lift);
  ctx.stroke();

  // Head and hair.
  ctx.fillStyle = '#c08a63';
  ctx.beginPath();
  ctx.arc(0, -94 + lift, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1a18';
  ctx.beginPath();
  ctx.arc(0, -97 + lift, 9, Math.PI * 1.05, Math.PI * 2.1);
  ctx.fill();
  ctx.restore();
}

/**
 * The Rolls: white body, red rims, black enforcer bumper, wide front splitter,
 * side skirts and a rear diffuser that has no business being on a saloon.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Centre of the car.
 * @param {number} y Ground line under the wheels.
 * @param {number} scale Length in pixels ÷ 220.
 * @param {object} [state] `{ spin, lean, alpha, headlights }`.
 */
export function drawRolls(ctx, x, y, scale, state = {}) {
  const { spin = 0, lean = 0, alpha = 1, headlights = 1 } = state;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(lean);

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 115, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wide front splitter — flat, forward, and deliberately too big.
  ctx.fillStyle = CAR.aero;
  ctx.beginPath();
  ctx.moveTo(-118, -12);
  ctx.lineTo(-138, -6);
  ctx.lineTo(-138, -1);
  ctx.lineTo(-92, -6);
  ctx.closePath();
  ctx.fill();

  // Rear diffuser: fins under a raked panel.
  ctx.beginPath();
  ctx.moveTo(86, -22);
  ctx.lineTo(128, -20);
  ctx.lineTo(120, -2);
  ctx.lineTo(86, -6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2a2a30';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(92 + i * 7, -18);
    ctx.lineTo(90 + i * 7, -4);
    ctx.stroke();
  }

  // Side skirts.
  ctx.fillStyle = CAR.aero;
  ctx.fillRect(-84, -13, 168, 7);

  // Body: a long bonnet, an upright cabin, a short deck.
  const body = ctx.createLinearGradient(0, -74, 0, -10);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.55, CAR.body);
  body.addColorStop(1, CAR.shadow);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-116, -20);
  ctx.lineTo(-116, -44);
  ctx.lineTo(-56, -50);
  ctx.lineTo(-30, -76);
  ctx.lineTo(44, -76);
  ctx.lineTo(66, -50);
  ctx.lineTo(122, -44);
  ctx.lineTo(124, -18);
  ctx.lineTo(-116, -18);
  ctx.closePath();
  ctx.fill();

  // Glasshouse.
  ctx.fillStyle = CAR.glass;
  ctx.beginPath();
  ctx.moveTo(-28, -72);
  ctx.lineTo(-52, -50);
  ctx.lineTo(42, -50);
  ctx.lineTo(42, -72);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(46, -72);
  ctx.lineTo(62, -50);
  ctx.lineTo(46, -50);
  ctx.closePath();
  ctx.fill();

  // The grille, upright and chrome, and the enforcer bumper across it.
  ctx.fillStyle = CAR.chrome;
  ctx.fillRect(-120, -46, 8, 26);
  ctx.fillStyle = CAR.aero;
  ctx.fillRect(-124, -30, 16, 14);
  ctx.fillRect(-112, -34, 6, 20);
  ctx.fillRect(-112, -46, 6, 8);

  if (headlights > 0) {
    ctx.fillStyle = css([255, 240, 190], 0.95 * headlights);
    ctx.fillRect(-118, -40, 10, 6);
    const beam = ctx.createLinearGradient(-120, -36, -320, -20);
    beam.addColorStop(0, css([255, 244, 200], 0.42 * headlights));
    beam.addColorStop(1, css([255, 244, 200], 0));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-118, -40);
    ctx.lineTo(-320, -66);
    ctx.lineTo(-320, 6);
    ctx.lineTo(-118, -30);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = css([255, 70, 60], 0.9);
  ctx.fillRect(118, -40, 8, 7);

  drawWheel(ctx, -70, -18, 24, spin);
  drawWheel(ctx, 72, -18, 24, spin);
  ctx.restore();
}

/** A wheel with a red rim and five spokes, spun by `spin` radians. */
function drawWheel(ctx, x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = CAR.tyre;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(spin);
  ctx.fillStyle = CAR.rim;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8c1219';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    ctx.stroke();
  }
  ctx.fillStyle = '#f1eee6';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * An armoured police Charger: push bar, plated flanks, roof bar.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Centre.
 * @param {number} y Ground line.
 * @param {number} scale Length in pixels ÷ 200.
 * @param {object} [state] `{ spin, flash, alpha }` — `flash` 0–1 cycles the bar.
 */
export function drawCharger(ctx, x, y, scale, state = {}) {
  const { spin = 0, flash = 0, alpha = 1 } = state;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 100, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body — the low, wide, hunched shape.
  const body = ctx.createLinearGradient(0, -64, 0, -12);
  body.addColorStop(0, '#20242c');
  body.addColorStop(1, '#0d0f14');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-104, -18);
  ctx.lineTo(-100, -40);
  ctx.lineTo(-48, -46);
  ctx.lineTo(-22, -68);
  ctx.lineTo(40, -68);
  ctx.lineTo(64, -46);
  ctx.lineTo(104, -40);
  ctx.lineTo(106, -18);
  ctx.closePath();
  ctx.fill();

  // The white door panel every American police car has.
  ctx.fillStyle = '#e8e8ea';
  ctx.beginPath();
  ctx.moveTo(-46, -46);
  ctx.lineTo(48, -46);
  ctx.lineTo(52, -20);
  ctx.lineTo(-48, -20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#10131a';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('POLICE', 2, -28);

  ctx.fillStyle = '#0f1620';
  ctx.beginPath();
  ctx.moveTo(-20, -64);
  ctx.lineTo(-42, -46);
  ctx.lineTo(38, -46);
  ctx.lineTo(38, -64);
  ctx.closePath();
  ctx.fill();

  // Armour: plated flanks, window grilles, and the push bar out front.
  ctx.fillStyle = '#2b2f38';
  ctx.fillRect(-96, -22, 196, 8);
  ctx.strokeStyle = '#4a505c';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-24 + i * 10, -64);
    ctx.lineTo(-24 + i * 10, -46);
    ctx.stroke();
  }
  ctx.fillStyle = '#171a20';
  ctx.fillRect(-118, -44, 12, 30);
  ctx.fillRect(-124, -40, 8, 6);
  ctx.fillRect(-124, -26, 8, 6);
  ctx.strokeStyle = '#171a20';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-112, -44);
  ctx.lineTo(-112, -14);
  ctx.stroke();

  // Light bar. The two halves alternate, which is what the eye reads as a
  // police car far more than the colours do.
  const left = flash < 0.5 ? 1 : 0.15;
  const right = flash >= 0.5 ? 1 : 0.15;
  ctx.fillStyle = css([40, 90, 255], left);
  ctx.fillRect(-20, -78, 28, 10);
  ctx.fillStyle = css([255, 40, 60], right);
  ctx.fillRect(10, -78, 28, 10);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.shadowBlur = 26;
  ctx.shadowColor = flash < 0.5 ? '#2a5aff' : '#ff283c';
  ctx.fillRect(-20, -78, 58, 10);
  ctx.restore();

  drawWheelDark(ctx, -62, -18, 22, spin);
  drawWheelDark(ctx, 66, -18, 22, spin);
  ctx.restore();
}

/** A black steel wheel, for anything that is not the Rolls. */
function drawWheelDark(ctx, x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#0d0d11';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(spin);
  ctx.fillStyle = '#3b414b';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#14161b';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.56, Math.sin(a) * r * 0.56);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A gunship, nose down, rotor blurred.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Centre.
 * @param {number} y Centre.
 * @param {number} scale Length in pixels ÷ 200.
 * @param {object} [state] `{ rotor, tilt, alpha, searchlight }`.
 */
export function drawChopper(ctx, x, y, scale, state = {}) {
  const { rotor = 0, tilt = -0.12, alpha = 1, searchlight = 0 } = state;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(tilt);

  if (searchlight > 0) {
    const beam = ctx.createLinearGradient(0, 10, 0, 420);
    beam.addColorStop(0, css([220, 240, 255], 0.34 * searchlight));
    beam.addColorStop(1, css([220, 240, 255], 0));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-8, 12);
    ctx.lineTo(-88, 420);
    ctx.lineTo(84, 420);
    ctx.lineTo(8, 12);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#2f3a2c';
  ctx.beginPath();
  ctx.ellipse(-6, 0, 52, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(40, -6);
  ctx.lineTo(112, -12);
  ctx.lineTo(112, 2);
  ctx.lineTo(40, 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(104, -12);
  ctx.lineTo(122, -34);
  ctx.lineTo(128, -10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1a2430';
  ctx.beginPath();
  ctx.ellipse(-34, -2, 20, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stub wings with stores under them.
  ctx.fillStyle = '#26301f';
  ctx.fillRect(-22, 12, 46, 7);
  ctx.fillRect(-18, 19, 14, 8);
  ctx.fillRect(8, 19, 14, 8);

  // Skids.
  ctx.strokeStyle = '#1d2418';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-40, 20); ctx.lineTo(-40, 32);
  ctx.moveTo(20, 20); ctx.lineTo(20, 32);
  ctx.moveTo(-56, 32); ctx.lineTo(38, 32);
  ctx.stroke();

  // Main rotor: a smeared disc plus two blades caught by the shutter.
  ctx.save();
  ctx.translate(-6, -22);
  ctx.fillStyle = 'rgba(190,210,220,0.14)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 120, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(215,230,235,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 2; i += 1) {
    const a = rotor + i * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 118, Math.sin(a) * 9);
    ctx.stroke();
  }
  ctx.fillStyle = '#20281c';
  ctx.fillRect(-4, -4, 8, 26);
  ctx.restore();

  // Tail rotor.
  ctx.save();
  ctx.translate(118, -20);
  ctx.rotate(rotor * 2.4);
  ctx.strokeStyle = 'rgba(215,230,235,0.4)';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

/**
 * Armour on the causeway.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Centre.
 * @param {number} y Ground line.
 * @param {number} scale Length in pixels ÷ 200.
 * @param {object} [state] `{ turret, alpha, muzzle }`.
 */
export function drawTank(ctx, x, y, scale, state = {}) {
  const { turret = -0.18, alpha = 1, muzzle = 0 } = state;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 96, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Track and road wheels.
  ctx.fillStyle = '#181c16';
  ctx.beginPath();
  ctx.roundRect(-96, -34, 192, 34, 14);
  ctx.fill();
  ctx.fillStyle = '#2c3327';
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.arc(-76 + i * 30, -16, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hull.
  ctx.fillStyle = '#3a442f';
  ctx.beginPath();
  ctx.moveTo(-98, -36);
  ctx.lineTo(-80, -54);
  ctx.lineTo(78, -54);
  ctx.lineTo(98, -36);
  ctx.closePath();
  ctx.fill();

  // Turret and gun.
  ctx.save();
  ctx.translate(-4, -54);
  ctx.fillStyle = '#44503a';
  ctx.beginPath();
  ctx.roundRect(-42, -26, 88, 26, 8);
  ctx.fill();
  ctx.rotate(turret);
  ctx.fillStyle = '#2f3927';
  ctx.fillRect(-40, -18, 148, 9);
  ctx.fillRect(96, -21, 14, 15);
  if (muzzle > 0) {
    ctx.fillStyle = css([255, 220, 130], muzzle);
    ctx.beginPath();
    ctx.moveTo(110, -13);
    ctx.lineTo(110 + 70 * muzzle, -40 * muzzle);
    ctx.lineTo(110 + 90 * muzzle, -13);
    ctx.lineTo(110 + 70 * muzzle, 14 * muzzle);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

/**
 * The gold truck: all straight lines, no curve anywhere on it.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Centre.
 * @param {number} y Ground line.
 * @param {number} scale Length in pixels ÷ 240.
 * @param {object} [state] `{ spin, alpha, hover }`.
 */
export function drawGoldTruck(ctx, x, y, scale, state = {}) {
  const { spin = 0, alpha = 1, hover = 0 } = state;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y - hover);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 2 + hover, 118, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const gold = ctx.createLinearGradient(0, -86, 0, -14);
  gold.addColorStop(0, '#ffe89a');
  gold.addColorStop(0.4, '#e0a92b');
  gold.addColorStop(1, '#8a6410');
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(-124, -18);
  ctx.lineTo(-124, -34);
  ctx.lineTo(-26, -86);
  ctx.lineTo(72, -86);
  ctx.lineTo(126, -40);
  ctx.lineTo(126, -18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(12,16,24,0.85)';
  ctx.beginPath();
  ctx.moveTo(-22, -80);
  ctx.lineTo(58, -80);
  ctx.lineTo(84, -54);
  ctx.lineTo(-22, -54);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css([255, 240, 190], 0.9);
  ctx.fillRect(-124, -32, 10, 5);
  ctx.fillStyle = css([255, 80, 60], 0.85);
  ctx.fillRect(118, -36, 8, 5);

  drawWheelDark(ctx, -74, -18, 26, spin);
  drawWheelDark(ctx, 78, -18, 26, spin);
  ctx.restore();
}

/**
 * The saucer, with a sticker on the hull.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Centre.
 * @param {number} y Centre.
 * @param {number} scale Width in pixels ÷ 320.
 * @param {object} [state] `{ spin, alpha, beam, charge }`.
 */
export function drawSaucer(ctx, x, y, scale, state = {}) {
  const { spin = 0, alpha = 1, beam = 0, charge = 0 } = state;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (beam > 0) {
    const cone = ctx.createLinearGradient(0, 20, 0, 700);
    cone.addColorStop(0, css([150, 255, 210], 0.5 * beam));
    cone.addColorStop(1, css([90, 255, 180], 0));
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(-46, 20);
    ctx.lineTo(-200 * beam - 60, 700);
    ctx.lineTo(200 * beam + 60, 700);
    ctx.lineTo(46, 20);
    ctx.closePath();
    ctx.fill();
  }

  // Hull.
  const hull = ctx.createLinearGradient(0, -30, 0, 26);
  hull.addColorStop(0, '#cfd9e6');
  hull.addColorStop(0.5, '#8895a8');
  hull.addColorStop(1, '#39414f');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.ellipse(0, 0, 160, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dome.
  const dome = ctx.createLinearGradient(0, -70, 0, -4);
  dome.addColorStop(0, css([190, 255, 235], 0.95));
  dome.addColorStop(1, css([40, 120, 110], 0.9));
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.ellipse(0, -6, 64, 44, 0, Math.PI, 0);
  ctx.fill();

  // Running lights around the rim.
  for (let i = 0; i < 12; i += 1) {
    const a = spin + (i / 12) * Math.PI * 2;
    const lx = Math.cos(a) * 150;
    const ly = Math.sin(a) * 26 + 8;
    const lit = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(a * 3 + spin * 4));
    ctx.fillStyle = css(charge > 0.2 ? [255, 140, 90] : [120, 255, 210], lit);
    ctx.beginPath();
    ctx.arc(lx, ly, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // The sticker. It is a sticker, so it is drawn like one — a rounded panel
  // stuck slightly crooked on the hull.
  ctx.save();
  ctx.translate(-58, 4);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#0d0f14';
  ctx.beginPath();
  ctx.roundRect(-32, -11, 64, 22, 6);
  ctx.fill();
  ctx.strokeStyle = '#f4f6fa';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#f4f6fa';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GROK', 0, 1);
  ctx.restore();

  if (charge > 0) {
    ctx.fillStyle = css([255, 200, 120], charge);
    ctx.beginPath();
    ctx.arc(0, 30, 10 + charge * 30, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Captain Colin's shield.
 *
 * Concentric rings in the operation's black and gold with a hard-edged C at
 * the centre, drawn as a path so it can be scaled up to fill the screen at the
 * moment of impact without going soft.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Centre.
 * @param {number} y Centre.
 * @param {number} r Radius.
 * @param {object} [state] `{ alpha, glow, spin }`.
 */
export function drawShield(ctx, x, y, r, state = {}) {
  const { alpha = 1, glow = 0, spin = 0 } = state;
  if (alpha <= 0.01 || r <= 0) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.rotate(spin);

  if (glow > 0) {
    ctx.shadowColor = css([255, 208, 64], 0.9 * glow);
    ctx.shadowBlur = r * 0.7 * glow;
  }
  // One gold rim, a dark field, and a letter big enough to cross both.
  //
  // Three versions of this read as a copyright mark before it worked, and the
  // reason was structural rather than a matter of weight: *any* glyph centred
  // inside concentric circles is ©. The fix is to stop containing it — the C
  // is set larger than the inner field, so its terminals run out over the rim
  // and the two shapes read as one monogram instead of a mark inside a ring.
  ctx.fillStyle = '#f6c945';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#141019';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.99, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#f6c945';
  ctx.font = `900 ${(r * 1.92).toFixed(1)}px Impact, "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C', 0, r * 0.02);
  ctx.restore();

  // A rim highlight, so it reads as metal rather than a target.
  ctx.strokeStyle = css([255, 255, 255], 0.45);
  ctx.lineWidth = Math.max(1, r * 0.02);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.97, Math.PI * 1.15, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();
}

/**
 * Captain Colin, braced over Tommy with the shield up.
 *
 * A cyborg in a lab coat: the coat catches the blast light, the machine half
 * of the face carries the red optic, and the shield is planted between the two
 * of them and the front.
 *
 * @param {CanvasRenderingContext2D} ctx Target.
 * @param {number} x Ground position.
 * @param {number} y Ground line.
 * @param {number} scale Height in pixels ÷ 150.
 * @param {object} [state] `{ alpha, brace, glow }`.
 */
export function drawColin(ctx, x, y, scale, state = {}) {
  const { alpha = 1, brace = 1, glow = 0 } = state;
  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  // Braced: knee down, shoulder into the shield.
  ctx.rotate(mix(0, -0.12, brace));

  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 40, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Planted leg and forward knee.
  ctx.strokeStyle = '#14161c';
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(6, -66);
  ctx.lineTo(30, -30);
  ctx.lineTo(34, -2);
  ctx.moveTo(6, -66);
  ctx.lineTo(-18, -34);
  ctx.lineTo(-34, -4);
  ctx.stroke();

  // The lab coat, over black and gold plate.
  ctx.fillStyle = '#0e1016';
  ctx.beginPath();
  ctx.roundRect(-16, -116, 34, 54, 8);
  ctx.fill();
  ctx.fillStyle = '#f6c945';
  ctx.beginPath();
  ctx.arc(2, -96, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0e1016';
  ctx.beginPath();
  ctx.arc(2, -96, 6.5, Math.PI * 0.3, Math.PI * 1.7);
  ctx.fill();

  ctx.fillStyle = '#f3f4f7';
  ctx.beginPath();
  ctx.moveTo(-16, -118);
  ctx.lineTo(-34, -108);
  ctx.lineTo(-40, -22);
  ctx.lineTo(-18, -30);
  ctx.lineTo(-16, -62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(18, -118);
  ctx.lineTo(36, -106);
  ctx.lineTo(40, -26);
  ctx.lineTo(18, -34);
  ctx.closePath();
  ctx.fill();

  // Head: flesh on one side, plate and optic on the other.
  ctx.fillStyle = '#b98157';
  ctx.beginPath();
  ctx.arc(4, -130, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242c';
  ctx.beginPath();
  ctx.arc(4, -130, 13, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
  ctx.fillStyle = css([255, 60, 50], 0.95);
  ctx.beginPath();
  ctx.arc(-3, -132, 3.4, 0, Math.PI * 2);
  ctx.fill();
  if (glow > 0) {
    ctx.shadowColor = css([255, 60, 50], glow);
    ctx.shadowBlur = 16 * glow;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Shield arm, and the shield itself planted into the blast.
  ctx.strokeStyle = '#1b1f27';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(-12, -104);
  ctx.lineTo(-44, -86);
  ctx.stroke();
  drawShield(ctx, -58, -80, 46, { glow: glow, spin: -0.12 });
  ctx.restore();
}
