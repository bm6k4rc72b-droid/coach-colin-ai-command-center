/**
 * The video wall.
 *
 * Nine dashboards drawn to 2D canvases and uploaded as textures onto the
 * curved wall in the hall. They are not decoration: the threat board, the
 * histograms, the world map, the radar and the gauges all render from the
 * live feed layer, so the wall behind the receptionist is showing the same
 * data the Ops deck is listing.
 *
 * Each renderer takes a plain 2D context and a snapshot, which keeps them
 * testable and lets the same code draw a desk screen at 256 px or a hero
 * panel at 1024 px.
 *
 * @module nexus/panels
 */

const INK = '#040a12';
const GRID = 'rgba(90, 216, 255, 0.14)';
const CYAN = '#5ad8ff';
const CYAN_DIM = 'rgba(90, 216, 255, 0.55)';
const GOLD = '#d8b45a';
const RED = '#ff5a72';
const GREEN = '#62e6a8';
const TEXT = '#bcd8e8';

/**
 * Deterministic noise, so a panel's filler content does not jitter between
 * redraws the way `Math.random` would.
 *
 * @param {number} i Index.
 * @param {number} salt Stream selector.
 * @returns {number} Value in [0, 1).
 */
function noise(i, salt = 0) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Fill the panel background and draw its chrome: title bar, frame, and the
 * faint grid every panel shares.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {string} title Panel title.
 * @param {string} [accent] Title colour.
 * @returns {{ top: number, pad: number }} Content box offsets.
 */
function chrome(g, w, h, title, accent = CYAN) {
  g.clearRect(0, 0, w, h);
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, 'rgba(9, 22, 34, 0.96)');
  bg.addColorStop(1, 'rgba(4, 10, 18, 0.98)');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);

  g.strokeStyle = GRID;
  g.lineWidth = 1;
  const step = Math.round(w / 22);
  g.beginPath();
  for (let x = step; x < w; x += step) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, h);
  }
  for (let y = step; y < h; y += step) {
    g.moveTo(0, y + 0.5);
    g.lineTo(w, y + 0.5);
  }
  g.stroke();

  const bar = Math.max(20, h * 0.085);
  g.fillStyle = 'rgba(90, 216, 255, 0.10)';
  g.fillRect(0, 0, w, bar);
  g.fillStyle = accent;
  g.fillRect(0, bar - 2, w, 2);
  g.font = `600 ${Math.round(bar * 0.52)}px ui-monospace, monospace`;
  g.textBaseline = 'middle';
  g.fillStyle = accent;
  g.fillText(title.toUpperCase(), 10, bar / 2 + 1);

  g.strokeStyle = 'rgba(140, 214, 255, 0.35)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);

  return { top: bar + 10, pad: 12 };
}

/**
 * Live threat board — the red list from the reference, fed by the highest
 * severity items the feed layer currently holds.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {object} data Snapshot from {@link snapshot}.
 */
function drawThreats(g, w, h, data) {
  const { top } = chrome(g, w, h, 'Live threats', RED);
  const rows = data.threats.slice(0, 6);
  const rowH = (h - top - 12) / Math.max(4, rows.length);
  const size = Math.min(15, rowH * 0.34);

  rows.forEach((row, i) => {
    const y = top + i * rowH;
    const severe = row.severity === 'high';
    g.fillStyle = severe ? 'rgba(255, 60, 84, 0.14)' : 'rgba(255, 120, 90, 0.07)';
    g.fillRect(6, y, w - 12, rowH - 6);
    g.fillStyle = severe ? RED : '#ff9d6b';
    g.fillRect(6, y, 3, rowH - 6);

    // Warning triangle.
    g.beginPath();
    const cx = 22;
    const cy = y + rowH / 2 - 3;
    g.moveTo(cx, cy - 7);
    g.lineTo(cx + 7, cy + 6);
    g.lineTo(cx - 7, cy + 6);
    g.closePath();
    g.strokeStyle = severe ? RED : '#ff9d6b';
    g.lineWidth = 1.6;
    g.stroke();

    g.font = `600 ${size}px ui-monospace, monospace`;
    g.fillStyle = severe ? '#ffd0d8' : '#ffd9c2';
    g.fillText(row.title.slice(0, 26).toUpperCase(), 36, cy);
    g.font = `${size * 0.82}px ui-monospace, monospace`;
    g.fillStyle = 'rgba(255, 200, 200, 0.6)';
    g.fillText(row.detail.slice(0, 34), 36, cy + size * 1.15);
  });
}

/**
 * Histogram panel — a real distribution over whatever the feed is carrying.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {object} data Snapshot.
 * @param {object} spec Panel spec, carrying `title` and `series`.
 */
function drawBars(g, w, h, data, spec) {
  const { top } = chrome(g, w, h, spec.title, CYAN);
  const values = data.series[spec.series] || [];
  const n = Math.max(12, values.length);
  const base = h - 18;
  const usable = base - top;
  const barW = (w - 24) / n;
  const max = Math.max(1, ...values);

  g.strokeStyle = 'rgba(90, 216, 255, 0.18)';
  g.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = Math.round(top + (usable * i) / 4) + 0.5;
    g.beginPath();
    g.moveTo(12, y);
    g.lineTo(w - 12, y);
    g.stroke();
  }

  for (let i = 0; i < n; i += 1) {
    const value = values[i] ?? noise(i, spec.series.length) * max * 0.6;
    const barH = Math.max(2, (value / max) * usable * 0.92);
    const x = 12 + i * barW;
    const hot = value / max > 0.72;
    const grad = g.createLinearGradient(0, base - barH, 0, base);
    grad.addColorStop(0, hot ? RED : CYAN);
    grad.addColorStop(1, hot ? 'rgba(255,90,114,0.15)' : 'rgba(90,216,255,0.12)');
    g.fillStyle = grad;
    g.fillRect(x, base - barH, Math.max(1, barW - 3), barH);
  }

  g.font = `${Math.round(h * 0.055)}px ui-monospace, monospace`;
  g.fillStyle = 'rgba(150, 190, 215, 0.7)';
  g.fillText(spec.axis || '', 12, h - 8);
}

/**
 * World map with live markers — the centrepiece panel behind the hologram.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {object} data Snapshot.
 * @param {object} spec Panel spec.
 */
function drawMap(g, w, h, data, spec) {
  const { top } = chrome(g, w, h, spec.title, spec.hostile ? RED : CYAN);
  const mapH = h - top - 14;
  const project = (lat, lon) => [
    ((lon + 180) / 360) * (w - 24) + 12,
    top + (0.5 - lat / 180) * mapH,
  ];

  // Landmasses as a dot matrix, which is how the reference reads and what
  // survives being scaled down to a desk screen.
  // Dot pitch and dot size both scale with the canvas, so the same renderer
  // fills a 1,600 px hero panel and a 256 px desk screen without going
  // either sparse or muddy.
  g.fillStyle = spec.hostile ? 'rgba(255, 130, 150, 0.42)' : 'rgba(96, 220, 255, 0.46)';
  const stepX = Math.max(3, Math.round(w / 190));
  const stepY = Math.max(3, Math.round(mapH / 70));
  const dot = Math.max(1.5, w / 460);
  for (let px = 12; px < w - 12; px += stepX) {
    for (let py = top; py < top + mapH; py += stepY) {
      const lon = ((px - 12) / (w - 24)) * 360 - 180;
      const lat = (0.5 - (py - top) / mapH) * 180;
      if (isLand(lat, lon)) g.fillRect(px, py, dot, dot);
    }
  }

  // Connection arcs between the busiest markers.
  const points = data.markers.slice(0, spec.hostile ? 26 : 40);
  g.strokeStyle = spec.hostile ? 'rgba(255, 90, 114, 0.35)' : 'rgba(90, 216, 255, 0.28)';
  g.lineWidth = 1;
  for (let i = 0; i + 1 < points.length; i += 3) {
    const [x1, y1] = project(points[i].lat, points[i].lon);
    const [x2, y2] = project(points[i + 1].lat, points[i + 1].lon);
    g.beginPath();
    g.moveTo(x1, y1);
    g.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 26, x2, y2);
    g.stroke();
  }

  const colours = {
    quake: '#ff7a4d', aircraft: '#6be8ff', launch: '#ffd166',
    satellite: '#b8c4ff', station: GREEN, threat: RED,
  };
  for (const point of points) {
    const [x, y] = project(point.lat, point.lon);
    const colour = colours[point.category] || CYAN;
    const pulse = 0.6 + 0.4 * Math.sin(data.time * 2 + x * 0.05);
    g.fillStyle = colour;
    g.globalAlpha = pulse;
    const rad = Math.max(2.2, w / 380);
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = pulse * 0.28;
    g.beginPath();
    g.arc(x, y, rad * 2.5 + 3 * pulse, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }

  g.font = `${Math.round(h * 0.05)}px ui-monospace, monospace`;
  g.fillStyle = 'rgba(150, 190, 215, 0.75)';
  g.fillText(`${points.length} TRACKS · ${data.status}`, 12, h - 8);
}

/**
 * Very coarse land test for the dot-matrix map.
 *
 * Boxes, not coastlines — at this dot pitch the eye reads continents from
 * the mass, and a real polygon test would cost far more than it returns.
 *
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @returns {boolean} Whether to plot a dot.
 */
function isLand(lat, lon) {
  const boxes = [
    [-168, -52, 12, 72], [-82, -34, -56, 12], [-12, 45, 35, 71], [-18, 52, -36, 37],
    [25, 145, 8, 78], [95, 141, -11, 8], [113, 154, -39, -11], [165, 179, -47, -34],
    [-180, -128, 52, 72], [-60, -10, 59, 84], [-25, -13, 63, 67], [100, 150, 20, 55],
  ];
  for (const [w, e, s, n] of boxes) {
    if (lon >= w && lon <= e && lat >= s && lat <= n) {
      // Ragged edges so the mass does not read as a rectangle.
      const edge = noise(Math.round(lon * 3), Math.round(lat * 3));
      const nearEdge = Math.min(lon - w, e - lon) < 6 || Math.min(lat - s, n - lat) < 5;
      return nearEdge ? edge > 0.45 : edge > 0.12;
    }
  }
  return false;
}

/**
 * Radar sweep with contacts — driven by real aircraft bearings where the
 * feed has them.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {object} data Snapshot.
 * @param {object} spec Panel spec.
 */
function drawRadar(g, w, h, data, spec) {
  const { top } = chrome(g, w, h, spec.title, CYAN);
  const cx = w / 2;
  const cy = top + (h - top) / 2 - 4;
  const r = Math.min(w, h - top) * 0.42;

  g.strokeStyle = CYAN_DIM;
  g.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring += 1) {
    g.globalAlpha = 0.35;
    g.beginPath();
    g.arc(cx, cy, (r * ring) / 4, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 0.28;
  for (let spoke = 0; spoke < 8; spoke += 1) {
    const a = (spoke / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
  g.globalAlpha = 1;

  // The sweep.
  const angle = (data.time * 0.9) % (Math.PI * 2);
  const sweep = g.createConicGradient
    ? g.createConicGradient(angle, cx, cy)
    : null;
  if (sweep) {
    sweep.addColorStop(0, 'rgba(90, 216, 255, 0.42)');
    sweep.addColorStop(0.12, 'rgba(90, 216, 255, 0.02)');
    sweep.addColorStop(1, 'rgba(90, 216, 255, 0)');
    g.fillStyle = sweep;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = CYAN;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  g.stroke();

  data.contacts.slice(0, 14).forEach((contact, i) => {
    const a = contact.bearing;
    const dist = contact.range * r;
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist;
    // Contacts fade as the sweep moves away from them.
    let delta = angle - a;
    while (delta < 0) delta += Math.PI * 2;
    const fade = Math.max(0.12, 1 - delta / (Math.PI * 1.6));
    g.globalAlpha = fade;
    g.fillStyle = i % 7 === 0 ? RED : GREEN;
    g.beginPath();
    g.arc(x, y, 2.6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  });
}

/**
 * Radial gauges — the endpoint-security dials from the reference, showing
 * real feed health and space weather.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {object} data Snapshot.
 * @param {object} spec Panel spec.
 */
function drawGauges(g, w, h, data, spec) {
  const { top } = chrome(g, w, h, spec.title, GOLD);
  const dials = data.gauges.slice(0, 3);
  const each = w / Math.max(1, dials.length);
  const cy = top + (h - top) / 2 - 6;
  const r = Math.min(each * 0.34, (h - top) * 0.34);

  dials.forEach((dial, i) => {
    const cx = each * (i + 0.5);
    g.lineWidth = Math.max(4, r * 0.22);
    g.strokeStyle = 'rgba(90, 216, 255, 0.14)';
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    g.stroke();

    const value = Math.max(0, Math.min(1, dial.value));
    g.strokeStyle = value > 0.75 ? RED : value > 0.45 ? GOLD : GREEN;
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * value);
    g.stroke();

    g.textAlign = 'center';
    g.font = `600 ${Math.round(r * 0.62)}px ui-monospace, monospace`;
    g.fillStyle = TEXT;
    g.fillText(dial.display, cx, cy + r * 0.16);
    g.font = `${Math.round(r * 0.32)}px ui-monospace, monospace`;
    g.fillStyle = 'rgba(150, 190, 215, 0.7)';
    g.fillText(dial.label.toUpperCase().slice(0, 16), cx, cy + r * 1.5);
    g.textAlign = 'left';
  });
}

/**
 * Telemetry log — the dense text columns from the reference, built from the
 * feed items so it reads as a real console rather than lorem ipsum.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {object} data Snapshot.
 * @param {object} spec Panel spec.
 */
function drawLog(g, w, h, data, spec) {
  const { top } = chrome(g, w, h, spec.title, CYAN);
  const size = Math.max(8, Math.round(h * 0.045));
  const lineH = size * 1.5;
  const rows = Math.floor((h - top - 8) / lineH);
  g.font = `${size}px ui-monospace, monospace`;

  for (let i = 0; i < rows; i += 1) {
    const item = data.log[(i + Math.floor(data.time * 0.4)) % Math.max(1, data.log.length)];
    if (!item) break;
    const y = top + i * lineH + size;
    g.fillStyle = 'rgba(90, 216, 255, 0.55)';
    g.fillText(item.stamp, 10, y);
    g.fillStyle = i % 5 === 0 ? GOLD : 'rgba(188, 216, 232, 0.82)';
    g.fillText(item.text.slice(0, Math.floor(w / (size * 0.62)) - 12), 10 + size * 5.2, y);
  }
}

/**
 * Network graph — the swarm's topology, which is the one panel that shows
 * the console's own state rather than the world's.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {object} data Snapshot.
 * @param {object} spec Panel spec.
 */
function drawNetwork(g, w, h, data, spec) {
  const { top } = chrome(g, w, h, spec.title, CYAN);
  const cx = w / 2;
  const cy = top + (h - top) / 2;
  const r = Math.min(w, h - top) * 0.34;
  const nodes = data.nodes.map((node, i) => {
    const a = (i / data.nodes.length) * Math.PI * 2 + data.time * 0.08;
    return { ...node, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.8 };
  });

  g.lineWidth = 1;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if ((i + j) % 3) continue;
      g.strokeStyle = 'rgba(90, 216, 255, 0.20)';
      g.beginPath();
      g.moveTo(nodes[i].x, nodes[i].y);
      g.lineTo(nodes[j].x, nodes[j].y);
      g.stroke();
    }
  }
  // Hub.
  g.strokeStyle = 'rgba(216, 180, 90, 0.35)';
  for (const node of nodes) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(node.x, node.y);
    g.stroke();
  }
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(cx, cy, 5, 0, Math.PI * 2);
  g.fill();

  g.font = `${Math.max(8, Math.round(h * 0.042))}px ui-monospace, monospace`;
  g.textAlign = 'center';
  for (const node of nodes) {
    g.fillStyle = node.colour;
    g.beginPath();
    g.arc(node.x, node.y, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(188, 216, 232, 0.8)';
    g.fillText(node.name.toUpperCase(), node.x, node.y + 16);
  }
  g.textAlign = 'left';
}

/** The nine wall panels, left to right along the arc. */
export const PANEL_SPECS = [
  { id: 'threats', draw: drawThreats, title: 'Live threats' },
  { id: 'seismic-bars', draw: drawBars, title: 'Seismic energy', series: 'quakes', axis: 'MAGNITUDE DISTRIBUTION · 24 H' },
  { id: 'log-a', draw: drawLog, title: 'Telemetry' },
  { id: 'radar', draw: drawRadar, title: 'Sector radar' },
  // Index 4 is the centre panel, directly behind the receptionist.
  { id: 'world', draw: drawMap, title: 'Global track picture' },
  { id: 'log-b', draw: drawLog, title: 'Feed ingest' },
  { id: 'threat-map', draw: drawMap, title: 'Threat map', hostile: true },
  { id: 'traffic-bars', draw: drawBars, title: 'Flight levels', series: 'altitudes', axis: 'ALTITUDE BANDS · FL' },
  { id: 'gauges', draw: drawGauges, title: 'Endpoint security' },
];

/** The panel drawn onto every operator desk screen. */
export const DESK_SPEC = { id: 'desk', draw: drawNetwork, title: 'Swarm' };

/**
 * Bin values across the range they actually occupy.
 *
 * Fixed bins over a nominal range leave a tightly-clustered feed showing two
 * lonely spikes; binning over the observed spread keeps the shape readable
 * whatever the data is doing.
 *
 * @param {number[]} values Samples.
 * @param {number} bins Bin count.
 * @returns {number[]} Counts per bin.
 */
export function histogram(values, bins) {
  const out = new Array(bins).fill(0);
  const usable = values.filter((v) => Number.isFinite(v) && v > 0);
  if (!usable.length) return out;
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min;
  if (span === 0) {
    // Every sample identical: there is no distribution to show, so stack them
    // in the middle rather than pinning them to the left edge, which would
    // read as "all low" instead of "all the same".
    out[Math.floor(bins / 2)] = usable.length;
    return out;
  }
  for (const value of usable) {
    out[Math.min(bins - 1, Math.floor(((value - min) / span) * bins))] += 1;
  }
  return out;
}

/**
 * Build the snapshot every renderer reads.
 *
 * Pure: takes the feed items and returns the shapes the panels want, so the
 * wall can be exercised without a feed service.
 *
 * @param {object[]} items Feed items, as from `Feeds.allItems()`.
 * @param {object} extra Extras: `time`, `status`, `agents`.
 * @returns {object} Snapshot.
 */
export function snapshot(items = [], extra = {}) {
  const time = extra.time ?? 0;
  const quakes = items.filter((i) => i.source === 'quakes');
  const aircraft = items.filter((i) => i.source === 'aircraft');

  const magnitudes = histogram(
    quakes.map((q) => Number((q.detail || '').match(/M([\d.]+)/)?.[1] || 0)), 12,
  );
  const altitudes = histogram(
    aircraft.map((a) => Number((a.detail || '').match(/FL(\d+)/)?.[1] || 0)), 14,
  );

  return {
    time,
    status: extra.status || 'STANDBY',
    threats: items
      .filter((i) => i.severity === 'high' || i.source === 'vulns' || i.source === 'space-weather')
      .slice(0, 6)
      .map((i) => ({ title: i.title, detail: i.detail || '', severity: i.severity })),
    series: { quakes: magnitudes, altitudes },
    markers: items
      .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lon))
      .map((i) => ({ lat: i.lat, lon: i.lon, category: i.category })),
    contacts: aircraft.slice(0, 14).map((plane, i) => ({
      bearing: (((plane.lon ?? 0) + 180) / 360) * Math.PI * 2,
      range: 0.25 + ((Math.abs(plane.lat ?? 0) % 60) / 60) * 0.7 + noise(i, 3) * 0.05,
    })),
    gauges: extra.gauges || [],
    log: items.slice(0, 40).map((item, i) => ({
      stamp: new Date(item.at || Date.now()).toISOString().slice(11, 19),
      text: `${(item.sourceLabel || 'FEED').toUpperCase().padEnd(9)} ${item.title} ${item.detail || ''}`,
      i,
    })),
    nodes: extra.agents || [],
  };
}

/**
 * Draw one panel.
 *
 * @param {CanvasRenderingContext2D} g Context.
 * @param {object} spec Panel spec.
 * @param {object} data Snapshot.
 */
export function drawPanel(g, spec, data) {
  const { width, height } = g.canvas;
  g.save();
  spec.draw(g, width, height, data, spec);
  g.restore();
}
