/* Route geometry. Field space: x = yards from the center of the field
   (negative = offense's left), y = yards downfield from the line of
   scrimmage. Each route returns timed waypoints so the renderer can
   place a receiver at any moment of the rep. */

const SIDELINE = 24;

export function routePath(routeName, startX, depth){
  const s = Math.sign(startX) || 1;             // 1 = right side of the ball
  const ax = Math.abs(startX);
  const P = (x, y, t) => ({ x, y, t });         // t = seconds from snap

  switch(routeName){
    case 'GO':
    case 'SEAM':
      return [P(startX,0,0), P(startX + s*0.6, depth*0.5, 0.9), P(startX + s*1.2, depth, 1.9)];
    case 'FADE':
      return [P(startX,0,0), P(s*Math.min(SIDELINE, ax+2), depth*0.5, 0.9), P(s*Math.min(SIDELINE, ax+3), depth, 1.9)];
    case 'BENDER':
      return [P(startX,0,0), P(startX, 9, 0.9), P(startX - s*4, depth*0.8, 1.5), P(startX - s*7, depth, 2.0)];
    case 'DIVIDE':
      return [P(startX,0,0), P(startX + s*1.5, 8, 0.9), P(startX + s*2, depth, 1.5), P(startX + s*2, depth+0.5, 2.1)];
    case 'POST':
      return [P(startX,0,0), P(startX, depth*0.55, 1.0), P(startX*0.45, depth*0.85, 1.6), P(startX*0.15, depth, 2.0)];
    case 'CORNER':
      return [P(startX,0,0), P(startX, depth*0.6, 1.0), P(s*Math.min(SIDELINE, ax+6), depth*0.9, 1.6), P(s*Math.min(SIDELINE, ax+8), depth, 2.0)];
    case 'DIG':
      return [P(startX,0,0), P(startX, depth-1, 1.1), P(startX - s*6, depth, 1.6), P(startX - s*13, depth, 2.3)];
    case 'CURL':
      return [P(startX,0,0), P(startX, depth+2, 1.1), P(startX - s*1.5, depth, 1.6), P(startX - s*2, depth-0.5, 2.0)];
    case 'SAIL':
      return [P(startX,0,0), P(startX, depth*0.6, 0.9), P(s*Math.min(SIDELINE, ax+7), depth, 1.7), P(s*Math.min(SIDELINE, ax+9), depth+1, 2.2)];
    case 'HITCH':
      return [P(startX,0,0), P(startX, depth, 0.9), P(startX + s*0.6, depth-1.2, 1.3)];
    case 'STICK':
    case 'SIT':
      return [P(startX,0,0), P(startX, depth, 0.8), P(startX - s*1.5, depth, 1.3)];
    case 'SLANT':
      return [P(startX,0,0), P(startX - s*2, 3, 0.6), P(startX - s*8, depth, 1.3), P(startX - s*13, depth+2, 1.9)];
    case 'RUB':
      return [P(startX,0,0), P(startX - s*4, 5, 0.7), P(-s*8, depth, 1.4), P(-s*15, depth+1, 2.1)];
    case 'FLAT':
    case 'ARROW':
      return [P(startX,0,0), P(s*Math.min(SIDELINE, ax+5), depth, 0.8), P(s*Math.min(SIDELINE, ax+9), depth+1, 1.5)];
    case 'WHEEL':
      return [P(startX,0,0), P(s*Math.min(SIDELINE, ax+4), 1, 0.7), P(s*Math.min(SIDELINE, ax+5), depth, 1.7)];
    case 'CHECK':
      return [P(startX,-4,0), P(startX + s*5, depth-2, 0.8), P(startX + s*9, depth, 1.5)];
    case 'BACK':
      return [P(startX,0,0), P(startX + s*2, depth, 1.0), P(startX + s*3, depth+1, 1.6)];
    default:
      return [P(startX,0,0), P(startX, depth, 1.4)];
  }
}

/* Position along a path at time t (seconds). */
export function atTime(path, t){
  if(t <= path[0].t) return { x:path[0].x, y:path[0].y };
  for(let i = 1; i < path.length; i++){
    if(t <= path[i].t){
      const a = path[i-1], b = path[i];
      const k = (t - a.t) / Math.max(0.0001, b.t - a.t);
      return { x:a.x + (b.x - a.x) * k, y:a.y + (b.y - a.y) * k };
    }
  }
  const last = path[path.length-1], prev = path[path.length-2] || last;
  const vx = (last.x - prev.x) / Math.max(0.001, last.t - prev.t);
  const vy = (last.y - prev.y) / Math.max(0.001, last.t - prev.t);
  const dt = t - last.t;
  return { x:last.x + vx*dt*0.55, y:last.y + vy*dt*0.55 };
}

export const ROUTE_LABEL = {
  GO:'GO', SEAM:'SEAM', FADE:'FADE', BENDER:'BEND', DIVIDE:'DIV', POST:'POST',
  CORNER:'CORN', DIG:'DIG', CURL:'CURL', SAIL:'SAIL', HITCH:'HITCH', STICK:'STICK',
  SIT:'SIT', SLANT:'SLANT', RUB:'RUB', FLAT:'FLAT', ARROW:'ARROW', WHEEL:'WHEEL',
  CHECK:'CHECK', BACK:'BACK',
};
