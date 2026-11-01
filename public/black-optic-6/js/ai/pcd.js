/**
 * Your LiDAR map, opened in the browser: read the .pcd that LIO-SAM (or
 * FAST-LIO, or Open3D) saves from the Ouster on the X500, and turn it into an
 * occupancy grid the twin can use.
 *
 * LIO-SAM itself — tightly coupled LiDAR-inertial odometry with factor-graph
 * smoothing — is a ROS C++ node and runs on the drone's Jetson, not here. Its
 * output is a point cloud map in PCD format, and PCD is simple enough to read
 * directly: a text header, then ascii rows, little-endian binary rows, or
 * "binary_compressed" (LZF-compressed columns). All three are handled.
 *
 * Occupancy, the way a ground robot's costmap does it: project points into a
 * 2-D grid; a cell is OCCUPIED when enough points sit in the obstacle height
 * band (default 0.3–2.5 m above the local ground), FREE when it only has
 * ground returns, UNKNOWN when the sensor never saw it. Ground height is taken
 * per cell as its lowest return, which is right for open pasture and wrong
 * under trees — a stated limitation.
 *
 * @module black-optic-6/ai/pcd
 */

export const UNKNOWN = 0;
export const FREE = 1;
export const OCCUPIED = 2;

/**
 * LZF decompression (liblzf format, as PCL writes it).
 *
 * @param {Uint8Array} input
 * @param {number} outLength Exact decompressed size from the header.
 * @returns {Uint8Array}
 */
export function lzfDecompress(input, outLength) {
  const out = new Uint8Array(outLength);
  let ip = 0; let op = 0;
  while (ip < input.length) {
    let ctrl = input[ip++];
    if (ctrl < 32) {
      ctrl += 1; // literal run of ctrl+1 bytes
      if (op + ctrl > outLength || ip + ctrl > input.length) throw new Error('LZF literal overruns');
      out.set(input.subarray(ip, ip + ctrl), op);
      ip += ctrl; op += ctrl;
    } else {
      let len = ctrl >> 5;
      let ref = op - ((ctrl & 0x1f) << 8) - 1;
      if (len === 7) len += input[ip++];
      ref -= input[ip++];
      len += 2;
      if (ref < 0 || op + len > outLength) throw new Error('LZF back-reference out of range');
      for (let k = 0; k < len; k += 1) out[op++] = out[ref++]; // may overlap: copy byte by byte
    }
  }
  if (op !== outLength) throw new Error(`LZF produced ${op} bytes, header says ${outLength}`);
  return out;
}

/**
 * Parse a PCD file.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{points: Float32Array, count: number, fields: string[], data: string, viewpoint: number[]}}
 *   points is xyz interleaved.
 */
export function parsePCD(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  // The header is ascii and ends with the DATA line.
  let end = -1;
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4096)));
  const m = /^DATA\s+(\S+)[^\n]*\n/m.exec(text);
  if (!m) throw new Error('No DATA line: not a PCD file.');
  end = m.index + m[0].length;
  const header = {};
  for (const line of text.slice(0, end).split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [k, ...rest] = t.split(/\s+/);
    header[k.toUpperCase()] = rest;
  }
  const fields = header.FIELDS ?? [];
  const size = (header.SIZE ?? []).map(Number);
  const type = header.TYPE ?? [];
  const cnt = (header.COUNT ?? fields.map(() => '1')).map(Number);
  const n = Number(header.POINTS?.[0] ?? (Number(header.WIDTH?.[0]) * Number(header.HEIGHT?.[0] ?? 1)));
  const data = (header.DATA?.[0] ?? '').toLowerCase();
  const ix = fields.indexOf('x'); const iy = fields.indexOf('y'); const iz = fields.indexOf('z');
  if (ix < 0 || iy < 0 || iz < 0) throw new Error('PCD has no x, y, z fields.');
  if (!(n >= 0)) throw new Error('PCD point count missing.');
  const points = new Float32Array(n * 3);

  const reader = (t, s) => {
    if (t === 'F' && s === 4) return (dv, o) => dv.getFloat32(o, true);
    if (t === 'F' && s === 8) return (dv, o) => dv.getFloat64(o, true);
    if (t === 'I' && s === 4) return (dv, o) => dv.getInt32(o, true);
    if (t === 'U' && s === 4) return (dv, o) => dv.getUint32(o, true);
    if (t === 'I' && s === 2) return (dv, o) => dv.getInt16(o, true);
    if (t === 'U' && s === 2) return (dv, o) => dv.getUint16(o, true);
    if (t === 'I' && s === 1) return (dv, o) => dv.getInt8(o);
    if (t === 'U' && s === 1) return (dv, o) => dv.getUint8(o);
    throw new Error(`Unsupported PCD type ${t}${s}`);
  };

  if (data === 'ascii') {
    const body = new TextDecoder().decode(bytes.subarray(end)).split('\n');
    // Column index of each field's first element.
    const col = []; let c = 0;
    for (let f = 0; f < fields.length; f += 1) { col.push(c); c += cnt[f]; }
    let p = 0;
    for (const line of body) {
      if (p >= n) break;
      const v = line.trim().split(/\s+/);
      if (v.length < c) continue;
      points[p * 3] = Number(v[col[ix]]); points[p * 3 + 1] = Number(v[col[iy]]); points[p * 3 + 2] = Number(v[col[iz]]);
      p += 1;
    }
    return { points: points.subarray(0, p * 3), count: p, fields, data, viewpoint: (header.VIEWPOINT ?? []).map(Number) };
  }

  const offsets = []; let stride = 0;
  for (let f = 0; f < fields.length; f += 1) { offsets.push(stride); stride += size[f] * cnt[f]; }
  const rx = reader(type[ix], size[ix]); const ry = reader(type[iy], size[iy]); const rz = reader(type[iz], size[iz]);

  if (data === 'binary') {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + end);
    if (dv.byteLength < n * stride) throw new Error('PCD binary body is shorter than POINTS × row size.');
    for (let p = 0; p < n; p += 1) {
      const o = p * stride;
      points[p * 3] = rx(dv, o + offsets[ix]); points[p * 3 + 1] = ry(dv, o + offsets[iy]); points[p * 3 + 2] = rz(dv, o + offsets[iz]);
    }
  } else if (data === 'binary_compressed') {
    const hv = new DataView(bytes.buffer, bytes.byteOffset + end, 8);
    const compressed = hv.getUint32(0, true); const raw = hv.getUint32(4, true);
    const body = lzfDecompress(bytes.subarray(end + 8, end + 8 + compressed), raw);
    // Columns are stored one after another: all x, then all y, …
    const colStart = []; let s = 0;
    for (let f = 0; f < fields.length; f += 1) { colStart.push(s); s += size[f] * cnt[f] * n; }
    const dv = new DataView(body.buffer);
    for (let p = 0; p < n; p += 1) {
      points[p * 3] = rx(dv, colStart[ix] + p * size[ix] * cnt[ix]);
      points[p * 3 + 1] = ry(dv, colStart[iy] + p * size[iy] * cnt[iy]);
      points[p * 3 + 2] = rz(dv, colStart[iz] + p * size[iz] * cnt[iz]);
    }
  } else {
    throw new Error(`Unknown PCD DATA kind "${data}".`);
  }
  return { points, count: n, fields, data, viewpoint: (header.VIEWPOINT ?? []).map(Number) };
}

/**
 * Occupancy grid from a point cloud (z up).
 *
 * @param {Float32Array} points xyz interleaved.
 * @param {object} [options]
 * @param {number} [options.cell=0.5] Cell size, metres.
 * @param {number} [options.bandLow=0.3] Obstacle band, metres above the cell's ground.
 * @param {number} [options.bandHigh=2.5]
 * @param {number} [options.minPoints=3] Returns in the band needed to call a cell occupied.
 * @returns {{grid: Uint8Array, cols: number, rows: number, minX: number, minY: number, cell: number,
 *   counts: {free: number, occupied: number, unknown: number}}}
 */
export function occupancy(points, { cell = 0.5, bandLow = 0.3, bandHigh = 2.5, minPoints = 3, maxCells = 4e6 } = {}) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const n = points.length / 3;
  for (let p = 0; p < n; p += 1) {
    const x = points[p * 3]; const y = points[p * 3 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { grid: new Uint8Array(0), cols: 0, rows: 0, minX: 0, minY: 0, cell, counts: { free: 0, occupied: 0, unknown: 0 } };
  const cols = Math.floor((maxX - minX) / cell) + 1;
  const rows = Math.floor((maxY - minY) / cell) + 1;
  if (cols * rows > maxCells) throw new Error(`Grid would be ${cols}×${rows}; raise the cell size.`);
  const ground = new Float32Array(cols * rows).fill(Infinity);
  const idx = (x, y) => Math.floor((y - minY) / cell) * cols + Math.floor((x - minX) / cell);
  for (let p = 0; p < n; p += 1) {
    const x = points[p * 3]; const y = points[p * 3 + 1]; const z = points[p * 3 + 2];
    if (!Number.isFinite(x + y + z)) continue;
    const i = idx(x, y);
    if (z < ground[i]) ground[i] = z;
  }
  const hits = new Uint32Array(cols * rows);
  for (let p = 0; p < n; p += 1) {
    const x = points[p * 3]; const y = points[p * 3 + 1]; const z = points[p * 3 + 2];
    if (!Number.isFinite(x + y + z)) continue;
    const i = idx(x, y);
    const above = z - ground[i];
    if (above >= bandLow && above <= bandHigh) hits[i] += 1;
  }
  const grid = new Uint8Array(cols * rows);
  const counts = { free: 0, occupied: 0, unknown: 0 };
  for (let i = 0; i < grid.length; i += 1) {
    if (ground[i] === Infinity) { grid[i] = UNKNOWN; counts.unknown += 1; } else if (hits[i] >= minPoints) { grid[i] = OCCUPIED; counts.occupied += 1; } else { grid[i] = FREE; counts.free += 1; }
  }
  return { grid, cols, rows, minX, minY, cell, counts };
}
