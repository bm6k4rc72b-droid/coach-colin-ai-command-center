// Tiny deterministic 3D value noise for organic shapes.
function h(x, y, z) { let n = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
const f = (t) => t * t * (3 - 2 * t);
function n3(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = f(x - X), v = f(y - Y), w = f(z - Z), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(X, Y, Z), h(X + 1, Y, Z), u), L(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v), L(L(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), L(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w); }
export function fbmish(x, y, z, o = 3) { let s = 0, a = 0.5, q = 1; for (let i = 0; i < o; i++) { s += a * n3(x * q, y * q, z * q); q *= 2.03; a *= 0.5; } return s; }
