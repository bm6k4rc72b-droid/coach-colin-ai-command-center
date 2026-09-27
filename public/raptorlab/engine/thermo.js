// ─────────────────────────────────────────────────────────────────────────────
// RAPTOR LAB · THERMODYNAMICS AND NOZZLE MATHEMATICS
//
// Pure functions, no rendering. Everything here is standard one-dimensional
// rocket theory (Sutton & Biblarz, "Rocket Propulsion Elements"; Hill & Peterson):
//
//   c*   = √(R·Tc) / Γ(γ),      Γ(γ) = √γ · (2/(γ+1))^((γ+1)/(2(γ−1)))
//   A/A* = (1/M) · [ (2/(γ+1)) · (1 + (γ−1)/2 · M²) ]^((γ+1)/(2(γ−1)))
//   pe/pc = (1 + (γ−1)/2 · Me²)^(−γ/(γ−1))
//   CF   = √( 2γ²/(γ−1) · (2/(γ+1))^((γ+1)/(γ−1)) · [1 − (pe/pc)^((γ−1)/γ)] ) + ε·(pe − pa)/pc
//   F    = CF · pc · At,   ṁ = pc · At / c*,   Isp = F / (ṁ · g0)
//
// The engine is a GENERIC full-flow staged-combustion methane/oxygen engine.
// Its dimensions are illustrative, not those of any real product.
// ─────────────────────────────────────────────────────────────────────────────

export const G0 = 9.80665;                 // standard gravity, m/s²
export const RU = 8314.462618;             // universal gas constant, J/(kmol·K)
export const RU_MOL = 8.314462618;         // J/(mol·K)
export const P_SL = 101325;                // sea-level pressure, Pa
export const BAR = 1e5;

// ── Engine geometry (illustrative) ─────────────────────────────
export const GEOM = {
  Rt: 0.11,            // throat radius, m
  eps: 34,             // nozzle area ratio Ae/At (sea-level nozzle)
  Rc: 0.20,            // combustion chamber radius, m
  Lc: 0.36,            // chamber cylindrical length, m
  thetaN: 32,          // bell initial wall angle, degrees (Rao, 80 % bell at ε≈34)
  thetaE: 8,           // bell exit wall angle, degrees
  bell: 0.8,           // bell length as a fraction of a 15° cone
};
GEOM.At = Math.PI * GEOM.Rt ** 2;
GEOM.Ae = GEOM.At * GEOM.eps;
GEOM.Re = GEOM.Rt * Math.sqrt(GEOM.eps);

export const RATED = { pc: 300 * BAR, MR: 3.6, etaCstar: 0.98, etaCF: 0.985 };

// ── Propellant properties ──────────────────────────────────────
// Vapour pressure from the integrated Clausius–Clapeyron equation, anchored at
// the normal boiling point:  p_v(T) = p_b · exp( −(ΔH_vap / R) · (1/T − 1/T_b) ).
export const PROP = {
  lox: { name: 'LOX', Tb: 90.188, dHvap: 6820, rho: 1141, Tbulk: 90.6, pTank: 3.5 * BAR, Tcrit: 154.58 },
  ch4: { name: 'LCH4', Tb: 111.66, dHvap: 8190, rho: 422.6, Tbulk: 112.2, pTank: 3.0 * BAR, Tcrit: 190.56 },
};
export function vaporPressure(prop, T) {
  if (T >= prop.Tcrit) return Infinity;   // supercritical: no liquid left to pump
  return P_SL * Math.exp(-(prop.dHvap / RU_MOL) * (1 / T - 1 / prop.Tb));
}

// ── Combustion products vs. mixture ratio ──────────────────────
// Shifting-equilibrium chamber properties for CH4/O2 near pc ≈ 300 bar
// (values of the kind produced by NASA CEA). Interpolated with a monotone cubic
// (Fritsch–Carlson), so the curves are smooth and never overshoot the data.
const MR_T = [2.0, 2.5, 3.0, 3.5, 3.6, 4.0, 4.5, 5.0, 6.0];
const TC_T = [2800, 3180, 3450, 3600, 3620, 3660, 3620, 3530, 3300];   // K
const MW_T = [16.2, 18.0, 19.9, 21.6, 21.9, 23.0, 24.3, 25.4, 27.0];   // kg/kmol
const GA_T = [1.200, 1.170, 1.155, 1.145, 1.143, 1.140, 1.142, 1.147, 1.160];

function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
const fTc = pchip(MR_T, TC_T), fMW = pchip(MR_T, MW_T), fGa = pchip(MR_T, GA_T);
export function products(MR) {
  const x = Math.min(7, Math.max(1.5, MR));
  const Tc = fTc(x), M = fMW(x), gamma = fGa(x);
  return { Tc, M, gamma, R: RU / M };
}

// ── Isentropic nozzle relations ────────────────────────────────
export const Gamma = (g) => Math.sqrt(g) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1)));
export const cstar = (g, R, Tc) => Math.sqrt(R * Tc) / Gamma(g);

export function areaRatio(M, g) {
  return (1 / M) * Math.pow((2 / (g + 1)) * (1 + 0.5 * (g - 1) * M * M), (g + 1) / (2 * (g - 1)));
}
// d(A/A*)/dM = (A/A*) · (M² − 1) / (M · (1 + (γ−1)/2 · M²))
const dAreaRatio = (M, g) => areaRatio(M, g) * (M * M - 1) / (M * (1 + 0.5 * (g - 1) * M * M));

// Supersonic (or subsonic) Mach number for a given area ratio, by Newton–Raphson.
export function machFromArea(eps, g, supersonic = true) {
  if (eps <= 1) return 1;
  let M = supersonic ? 1 + Math.sqrt(eps) : 0.5 / eps;
  for (let i = 0; i < 60; i++) {
    const f = areaRatio(M, g) - eps, df = dAreaRatio(M, g);
    let next = M - f / df;
    if (supersonic) next = Math.max(1.0001, next); else next = Math.min(0.9999, Math.max(1e-6, next));
    if (Math.abs(next - M) < 1e-12) { M = next; break; }
    M = next;
  }
  return M;
}
export const pressureRatio = (M, g) => Math.pow(1 + 0.5 * (g - 1) * M * M, -g / (g - 1));

export function thrustCoefficient(g, eps, pePc, paPc) {
  const mom = Math.sqrt((2 * g * g / (g - 1)) * Math.pow(2 / (g + 1), (g + 1) / (g - 1)) * (1 - Math.pow(pePc, (g - 1) / g)));
  return { CF: mom + eps * (pePc - paPc), CFmom: mom, CFpres: eps * (pePc - paPc) };
}

// Full performance at a chamber pressure pc (Pa), mixture ratio MR, ambient pa (Pa).
export function performance(pc, MR, pa = P_SL, g = GEOM) {
  const P = products(MR);
  const cs = cstar(P.gamma, P.R, P.Tc) * RATED.etaCstar;
  const Me = machFromArea(g.eps, P.gamma);
  const pePc = pressureRatio(Me, P.gamma);
  const pe = pePc * pc;
  // Over-expanded at sea level, the jet separates where the wall pressure falls to ≈0.35·pa
  // (Summerfield). Beyond that point the nozzle carries ambient pressure, so the effective exit is
  // the separation station: solve p(ε_s) = 0.35·pa for its Mach number, then ε_s = A/A*(M_s).
  let epsEff = g.eps, pePcEff = pePc;
  if (pe < 0.35 * pa) {
    pePcEff = 0.35 * pa / pc;
    const Ms = Math.sqrt((2 / (P.gamma - 1)) * (Math.pow(pePcEff, -(P.gamma - 1) / P.gamma) - 1));
    epsEff = Ms > 1 ? areaRatio(Ms, P.gamma) : 1;
  }
  const cf = thrustCoefficient(P.gamma, epsEff, pePcEff, pa / pc);
  const CF = cf.CF * RATED.etaCF;
  const mdot = pc * g.At / cs;
  const F = CF * pc * g.At;
  const Isp = F / (mdot * G0);
  // Vacuum figures for reference.
  const CFvac = (cf.CFmom + g.eps * pePc) * RATED.etaCF;
  const IspVac = CFvac * cs / G0;
  // Exit velocity and exit static temperature (isentropic from the chamber).
  const Te = P.Tc * Math.pow(pePc, (P.gamma - 1) / P.gamma);
  const ve = Me * Math.sqrt(P.gamma * P.R * Te);
  return { ...P, cstar: cs, Me, pePc, pe, CF, mdot, F, Isp, IspVac, Te, ve, sep: separation(pe, pa), epsEff };
}

// Summerfield criterion: the jet separates from the wall when pe ≲ 0.25–0.4 · pa.
// Returns 0 (attached) … 1 (fully separated) across that band.
export function separation(pe, pa) {
  const r = pe / pa;
  return Math.min(1, Math.max(0, (0.4 - r) / 0.15));
}

// ── Plume: fully expanded jet and shock-cell ("Mach diamond") spacing ──
// Fully expanded jet Mach from the stagnation-to-ambient ratio,
//   Mj = √( 2/(γ−1) · [ (pc/pa)^((γ−1)/γ) − 1 ] ),
// jet diameter from continuity (Dj = Dt·√(A/A*(Mj))), and the Prandtl–Pack
// shock-cell length  L ≈ 1.306 · Dj · √(Mj² − 1)  (Tam, 1988).
export function plume(pc, gamma, pa = P_SL, g = GEOM) {
  const Mj = Math.sqrt((2 / (gamma - 1)) * (Math.pow(pc / pa, (gamma - 1) / gamma) - 1));
  const Dj = 2 * g.Rt * Math.sqrt(areaRatio(Mj, gamma));
  const L = 1.306 * Dj * Math.sqrt(Mj * Mj - 1);
  return { Mj, Dj, L };
}

// ── Chamber acoustics ──────────────────────────────────────────
// First tangential mode f₁T = α₁₁ · a / (π · Dc), α₁₁ = 1.8412 (first zero of J₁′);
// first longitudinal mode f₁L ≈ a / (2 · L). a = √(γ·R·T).
export function acoustics(gamma, R, Tc, g = GEOM) {
  const a = Math.sqrt(gamma * R * Tc);
  return { a, f1T: 1.8412 * a / (Math.PI * 2 * g.Rc), f1L: a / (2 * (g.Lc + 0.25)) };
}

// ── Nozzle wall contour (Rao thrust-optimised parabola) ────────
// Converging arc (radius 1.5·Rt), throat arc (0.382·Rt) to the inflection
// point N at θn, then a quadratic Bézier N → E whose control point Q is the
// intersection of the tangents at N (θn) and E (θe).
export function nozzleContour(g = GEOM, n = 64) {
  const Rt = g.Rt, rad = Math.PI / 180, thN = g.thetaN * rad, thE = g.thetaE * rad;
  const Ln = g.bell * ((Math.sqrt(g.eps) - 1) * Rt) / Math.tan(15 * rad);
  const pts = [];
  // Chamber cylinder and converging section (45° cone blended by the 1.5·Rt arc).
  const Rc = g.Rc, conv = 45 * rad;
  const arcUp = (a) => [-1.5 * Rt * Math.sin(a), Rt + 1.5 * Rt * (1 - Math.cos(a))];
  const [xA, rA] = arcUp(conv);
  const xConeStart = xA - (Rc - rA) / Math.tan(conv);
  pts.push([xConeStart - g.Lc, Rc], [xConeStart, Rc]);
  for (let i = 0; i <= 10; i++) { const a = conv * (1 - i / 10); pts.push(arcUp(a)); }
  // Throat downstream arc to N.
  for (let i = 1; i <= 10; i++) { const a = thN * i / 10; pts.push([0.382 * Rt * Math.sin(a), Rt + 0.382 * Rt * (1 - Math.cos(a))]); }
  const [xN, yN] = pts[pts.length - 1];
  const xE = Ln, yE = g.Re;
  // Tangent intersection Q.
  const m1 = Math.tan(thN), m2 = Math.tan(thE);
  const c1 = yN - m1 * xN, c2 = yE - m2 * xE;
  const xQ = (c2 - c1) / (m1 - m2), yQ = m1 * xQ + c1;
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * xN + 2 * u * t * xQ + t * t * xE, u * u * yN + 2 * u * t * yQ + t * t * yE]);
  }
  return { pts, Ln, xQ, yQ, xN, yN };
}
