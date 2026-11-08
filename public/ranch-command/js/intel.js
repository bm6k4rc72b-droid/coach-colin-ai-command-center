/**
 * RANCH COMMAND — the environmental intelligence suite.
 *
 * Four data-screen slides: atmospheric (weather) intelligence, the
 * Pyro-Sentinel fire and smoke grid, fuel-moisture intelligence and strike
 * (lightning) intelligence. Every reading on these screens is demonstration
 * telemetry and is labelled so: the slides show what a deployment reports,
 * not live conditions. Each one names the real hardware and data feeds a
 * deployment would use.
 *
 * Decision support only. None of this replaces a certified alarm, an
 * official evacuation order or a call to 911.
 *
 * @module ranch-command/intel
 */

import { el } from './dom.js';

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/';
export const ART = {
  lab: `${CDN}hf_20261108_183754_6311710e-5e25-49b2-b8b8-fe81c3238e90.png`,
  weather: `${CDN}hf_20261108_183753_188b1f07-bd24-42a5-9153-24479fa80099.png`,
  fire: `${CDN}hf_20261108_183753_5c36ad9a-e187-4b0b-b557-739173ea9941.png`,
  moisture: `${CDN}hf_20261108_183754_cad89d7b-06db-42bd-9d0b-525ae5f8062c.png`,
  lightning: `${CDN}hf_20261108_183754_44eee58d-c6fc-4144-bf15-8d2358a73049.png`,
};

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) if (c) node.append(c);
  return node;
}

/** A deterministic wobble, so the demo screens look alive but never lie twice. */
const wave = (i, a = 1, f = 0.35, p = 0) => a * Math.sin(i * f + p) + a * 0.35 * Math.sin(i * f * 2.7 + p * 1.3);

/* --------------------------------------------------------------- pieces */

/** The hero plate: generated art inside a bezel with a HUD reticle. */
function plate(key, label, code) {
  return el('figure.plate', {}, [
    el('img', { src: ART[key], alt: '', decoding: 'async', onerror: (e) => { e.target.style.visibility = 'hidden'; } }),
    el('div.plate-hud', { 'aria-hidden': 'true' }, [el('span.br.tl'), el('span.br.tr'), el('span.br.bl'), el('span.br.br2'), el('span.plate-sweep')]),
    el('figcaption', {}, [el('span.live-dot'), el('b', { text: label }), el('span.mono', { text: code })]),
  ]);
}

/** A data screen: a framed panel with a title strip. */
function screen(title, children, meta = 'DEMO TELEMETRY') {
  return el('section.screen', {}, [
    el('header.screen-bar', {}, [el('span.screen-title', { text: title }), el('span.screen-meta', { text: meta })]),
    el('div.screen-body', {}, children),
  ]);
}

/** A readout tile. */
const readout = (value, unit, label, tone = '') => el(`div.readout${tone ? `.${tone}` : ''}`, {}, [
  el('b', {}, [value, el('small', { text: unit })]),
  el('span', { text: label }),
]);

/** A capability list. */
const caps = (items) => el('ul.caps', {}, items.map(([h, t]) => el('li', {}, [el('b', { text: h }), el('span', { text: t })])));

/** A sensor-stack table: component, role, interface. */
const stack = (rows) => el('div.stack-table', {}, rows.map(([name, role, via]) => el('div.st-row', {}, [el('b', { text: name }), el('span', { text: role }), el('code', { text: via })])));

/** A sparkline / area chart. */
function spark(values, { color = 'var(--gold)', fill = 'rgba(255,207,74,0.12)', min, max, threshold, tLabel } = {}) {
  const w = 320;
  const h = 90;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const x = (i) => (i / (values.length - 1)) * w;
  const y = (v) => h - ((v - lo) / Math.max(1e-6, hi - lo)) * (h - 10) - 5;
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'spark', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
    ...[0.25, 0.5, 0.75].map((g) => svg('line', { x1: 0, x2: w, y1: h * g, y2: h * g, class: 'grid-line' })),
    svg('path', { d: `${line}L${w},${h}L0,${h}Z`, fill }),
    svg('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', class: 'draw' }),
    threshold != null ? svg('line', { x1: 0, x2: w, y1: y(threshold), y2: y(threshold), class: 'threshold' }) : null,
    threshold != null && tLabel ? svg('text', { x: w - 4, y: y(threshold) - 4, 'text-anchor': 'end', class: 'svg-label' }, [document.createTextNode(tLabel)]) : null,
  ]);
}

/** A horizontal bar meter. */
const meter = (label, pct, tone = '', note = '') => el(`div.gauge${tone ? `.${tone}` : ''}`, {}, [
  el('div.gauge-head', {}, [el('span', { text: label }), el('b', { text: note || `${Math.round(pct)}%` })]),
  el('div.gauge-track', {}, [el('div.gauge-fill', { style: { '--w': `${Math.max(2, Math.min(100, pct))}%` } })]),
]);

const disclaimer = () => el('p.faint.disclaim', { text: 'Readings shown are demonstration telemetry. A deployment is decision support: it never replaces a certified alarm, an official evacuation order or a call to 911.' });

/* --------------------------------------------------------------- slides */

export const INTEL_SLIDES = [
  /* ------------------------------------------------------------ weather */
  {
    id: 'weather',
    stateless: true,
    kicker: 'Atmospheric intelligence · predictive micro-climate command',
    title: 'Atmospheric Intelligence // Predictive Weather Command',
    lede: 'Hyperlocal meteorological telemetry from your own instrumented stations, fused with national ensemble forecast guidance into a single predictive fire-weather posture for the property — minute by minute, zone by zone.',
    render() {
      const wind = Array.from({ length: 48 }, (_, i) => 9 + i * 0.32 + wave(i, 3.2));
      const rh = Array.from({ length: 48 }, (_, i) => 34 - i * 0.38 + wave(i, 2.4, 0.3, 1));
      return el('div.grid.intel', {}, [
        el('div.intel-hero', {}, [
          plate('weather', 'STATION WX-01 · NORTH RIDGE', '34.6391°N 120.4579°W'),
          screen('Live micro-climate vector', [
            el('div.readouts', {}, [
              readout('91', '°F', 'Dry bulb'),
              readout('14', '%', 'Relative humidity', 'red'),
              readout('22', 'mph', 'Sustained · NE', 'amber'),
              readout('38', 'mph', 'Peak gust', 'red'),
              readout('5.8', 'kPa', 'Vapour-pressure deficit', 'amber'),
              readout('71', '', 'Fosberg FFWI', 'red'),
            ]),
            el('div.chart-pair', {}, [
              el('div', {}, [el('p.chart-l', { text: 'Wind speed · 48 h ensemble (mph)' }), spark(wind, { color: 'var(--amber)', fill: 'rgba(255,176,32,0.12)', threshold: 25, tLabel: 'RED FLAG 25' })]),
              el('div', {}, [el('p.chart-l', { text: 'Relative humidity · 48 h (%)' }), spark(rh, { color: 'var(--cyan)', fill: 'rgba(78,227,255,0.10)', threshold: 15, tLabel: 'CRITICAL 15%' })]),
            ]),
          ]),
        ]),
        el('div.grid.g3', {}, [
          screen('Predictive posture', [
            meter('Red Flag probability · next 24 h', 82, 'red'),
            meter('Hot-Dry-Windy Index percentile', 94, 'red', '94th pct'),
            meter('Cattle heat-stress (THI)', 61, 'amber', 'THI 78 · alert'),
            meter('Frost risk · 72 h', 4, 'green'),
          ], 'MODEL FUSION'),
          screen('Capabilities', [caps([
            ['Ensemble fusion', 'Station truth blended with NWS gridded forecasts, HRRR and Open-Meteo ensembles; bias-corrected to your terrain.'],
            ['Fire-weather indices', 'Fosberg FFWI, Hot-Dry-Windy Index and Red Flag criteria computed continuously, per zone.'],
            ['Wind-shift foresight', 'Frontal passages and offshore wind events flagged hours ahead, with the bearing they will push fire.'],
            ['Livestock climate', 'Temperature-Humidity Index for cattle heat stress; frost and freeze windows for water lines.'],
          ])], 'SCOPE'),
          screen('Instrumentation & data sovereignty', [stack([
            ['Ultrasonic station', 'Wind, gust, temp, RH, pressure, solar, rain', 'Davis · Tempest · Campbell'],
            ['WeeWX', 'Archive + publish every reading', 'MQTT → edge'],
            ['NWS API', 'Watches, warnings, Red Flag', 'api.weather.gov'],
            ['Open-Meteo / HRRR', 'Hourly ensembles to 16 days', 'REST'],
          ])], 'STACK'),
        ]),
        disclaimer(),
      ]);
    },
  },

  /* --------------------------------------------------------------- fire */
  {
    id: 'fire',
    stateless: true,
    kicker: 'Pyro-Sentinel · multi-modal ignition detection',
    title: 'Pyro-Sentinel // Fire & Smoke Detection Grid',
    lede: 'Computer-vision smoke detection on the ridgelines, particulate and gas chemistry at ground level, and orbital thermal confirmation — fused by a corroboration engine that escalates only when independent evidence agrees.',
    render() {
      const pm = Array.from({ length: 48 }, (_, i) => 8 + (i > 30 ? (i - 30) ** 1.55 : 0) + Math.abs(wave(i, 2)));
      return el('div.grid.intel', {}, [
        el('div.intel-hero', {}, [
          plate('fire', 'PYRO-CAM 03 · EAST RIDGE · SMOKE CANDIDATE', 'BRG 071° · 6.4 km'),
          screen('Corroboration engine', [
            el('div.fusion', {}, [
              meter('Vision · smoke plume classifier', 87, 'amber'),
              meter('Particulate · PM2.5 surge at node F-2', 74, 'amber', '96 µg/m³'),
              meter('Gas · CO / VOC delta', 41, '', '+38 ppm'),
              meter('Orbital · NASA FIRMS / GOES hotspot', 0, '', 'awaiting pass'),
            ]),
            el('div.verdict', {}, [el('span.tag.red', { text: 'Escalated · owner verify' }), el('span.mono', { text: 'fused confidence 0.81 · 3 of 4 modalities' })]),
            el('div', {}, [el('p.chart-l', { text: 'PM2.5 · node F-2 · last 4 h (µg/m³)' }), spark(pm, { color: 'var(--red)', fill: 'rgba(255,45,61,0.12)', threshold: 55, tLabel: 'UNHEALTHY 55' })]),
          ], 'INCIDENT FS-0117'),
        ]),
        el('div.grid.g3', {}, [
          screen('Detection doctrine', [caps([
            ['Ridge-line vision', 'Panoramic cameras with on-edge smoke classifiers sweep every horizon, day and night.'],
            ['Ground chemistry', 'Laser particulate counters and CO/VOC cells catch smoke that cameras cannot see.'],
            ['Orbital confirmation', 'NASA FIRMS (VIIRS, MODIS) and GOES-18 fire products confirm heat from space.'],
            ['Corroborated escalation', 'Independent modalities must agree before escalation, crushing false alarms from dust and fog.'],
          ])], 'SCOPE'),
          screen('Response choreography', [caps([
            ['T+0 s', 'Candidate detected; adjacent cameras slew to bearing.'],
            ['T+20 s', 'Ground sensors and wind vector correlated; spread bearing projected.'],
            ['T+45 s', 'Owner receives a verified alert with imagery, bearing and wind.'],
            ['Human decision', 'A person confirms and calls 911. Nothing is dispatched automatically.'],
          ])], 'PLAYBOOK'),
          screen('Sensor stack', [stack([
            ['Pyronear PyroEngine', 'Open-source smoke detection', 'edge · ONNX'],
            ['PMS5003 / PurpleAir', 'PM1 · PM2.5 · PM10', 'LoRaWAN · MQTT'],
            ['CO / VOC cells', 'Combustion gas delta', 'LoRaWAN'],
            ['NASA FIRMS', 'Satellite hotspots, trailing 24 h', 'REST (map key)'],
          ])], 'STACK'),
        ]),
        disclaimer(),
      ]);
    },
  },

  /* ----------------------------------------------------------- moisture */
  {
    id: 'moisture',
    stateless: true,
    kicker: 'Fuel-moisture intelligence · combustion readiness analytics',
    title: 'Fuel-Moisture Intelligence // Combustion Readiness',
    lede: 'Calibrated dead-fuel moisture sticks, volumetric soil probes and live-fuel sampling quantify exactly how receptive each pasture, canyon and fenceline is to ignition — the variable that decides whether a spark becomes a fire.',
    render() {
      const zones = [['North Ridge', 5.2], ['Oak Canyon', 7.4], ['Home Pasture', 11.8], ['Creek Bottom', 18.6], ['West Fenceline', 6.1], ['Hay Barn Apron', 9.3]];
      const tone = (v) => (v < 8 ? 'red' : v < 12 ? 'amber' : 'green');
      const trend = Array.from({ length: 48 }, (_, i) => 14 - i * 0.17 + wave(i, 0.9, 0.26));
      return el('div.grid.intel', {}, [
        el('div.intel-hero', {}, [
          plate('moisture', 'FM-10 STATION · NORTH RIDGE', '10-hr dead fuel · 5.2 %'),
          screen('Zone readiness matrix', [
            el('div.zone-grid', {}, zones.map(([name, v]) => el(`div.zone.${tone(v)}`, {}, [el('b', { text: `${v.toFixed(1)}%` }), el('span', { text: name }), el('i', { text: v < 8 ? 'CRITICAL' : v < 12 ? 'ELEVATED' : 'NOMINAL' })]))),
            el('div', {}, [el('p.chart-l', { text: '10-hr fuel moisture · North Ridge · 48 h (%)' }), spark(trend, { color: 'var(--red)', fill: 'rgba(255,45,61,0.10)', threshold: 8, tLabel: 'IGNITION-RECEPTIVE < 8%' })]),
          ], 'SIX ZONES'),
        ]),
        el('div.grid.g3', {}, [
          screen('Analytics', [
            meter('Probability of ignition · North Ridge', 78, 'red', 'PIG 78%'),
            meter('Energy release component (ERC) percentile', 91, 'red', '91st pct'),
            meter('Soil volumetric water · root zone', 9, 'amber', '9 % VWC'),
            meter('Live fuel moisture · chamise', 64, 'amber', '64 %'),
          ], 'MODEL'),
          screen('Capabilities', [caps([
            ['Dead-fuel telemetry', 'Standard 10-hour fuel sticks weighed electronically, the same reference agencies use.'],
            ['Nelson moisture model', 'Hourly 1-, 10-, 100- and 1000-hour moisture computed from your own weather.'],
            ['Ignition probability', 'Probability-of-ignition tables per zone, fused with temperature and shading.'],
            ['Grazing as fuel control', 'Recommends where targeted grazing will cut fine-fuel load before fire season.'],
          ])], 'SCOPE'),
          screen('Sensor stack', [stack([
            ['Campbell CS506', '10-hr fuel moisture stick', 'SDI-12 → LoRa'],
            ['Capacitive / TDR probes', 'Soil water by depth', 'LoRaWAN'],
            ['RAWS reference', 'Agency station cross-check', 'Synoptic / MesoWest'],
            ['Edge model', 'Nelson + PIG tables', 'Jetson · Python'],
          ])], 'STACK'),
        ]),
        disclaimer(),
      ]);
    },
  },

  /* ---------------------------------------------------------- lightning */
  {
    id: 'lightning',
    stateless: true,
    kicker: 'Strike intelligence · electrostatic threat detection',
    title: 'Strike Intelligence // Lightning & Holdover Surveillance',
    lede: 'Local electromagnetic strike sensing gives storm range in real time; licensed geolocation networks pin each discharge to the metre. Every ground strike is then cross-referenced with fuel moisture to hunt holdover fires before they surface.',
    render() {
      const strikes = [[0.62, 0.3, 'CG'], [0.71, 0.36, 'CG'], [0.55, 0.22, 'IC'], [0.8, 0.44, 'CG'], [0.44, 0.62, 'IC'], [0.3, 0.7, 'CG'], [0.66, 0.58, 'IC'], [0.52, 0.41, 'CG']];
      const plot = svg('svg', { viewBox: '0 0 200 200', class: 'strike-map', 'aria-label': 'Strike plot' }, [
        ...[90, 66, 42, 18].map((r) => svg('circle', { cx: 100, cy: 100, r, class: 'ring' })),
        svg('line', { x1: 100, y1: 6, x2: 100, y2: 194, class: 'ring' }),
        svg('line', { x1: 6, y1: 100, x2: 194, y2: 100, class: 'ring' }),
        svg('g', { class: 'sweep' }, [svg('path', { d: 'M100 100 L100 10 A90 90 0 0 1 163.6 36.4 Z' })]),
        ...strikes.map(([sx, sy, t], i) => svg('g', { class: `strike ${t === 'CG' ? 'cg' : 'ic'}`, style: `--d:${i * 0.35}s` }, [
          svg('circle', { cx: sx * 200, cy: sy * 200, r: t === 'CG' ? 4 : 3 }),
          svg('circle', { cx: sx * 200, cy: sy * 200, r: 4, class: 'pulse' }),
        ])),
        svg('circle', { cx: 100, cy: 100, r: 4, class: 'home' }),
        svg('text', { x: 104, y: 98, class: 'svg-label' }, [document.createTextNode('RANCH')]),
        svg('text', { x: 102, y: 18, class: 'svg-label dim' }, [document.createTextNode('40 km')]),
      ]);
      return el('div.grid.intel', {}, [
        el('div.intel-hero', {}, [
          plate('lightning', 'STRIKE SENSOR LS-1 · STORM CELL INBOUND', 'range 17 km · closing'),
          screen('Strike plot · 40 km radius', [
            el('div.strike-wrap', {}, [plot, el('div.readouts.col', {}, [
              readout('17', 'km', 'Nearest storm front', 'amber'),
              readout('8', '', 'Strikes · last 30 min'),
              readout('5', '', 'Cloud-to-ground', 'red'),
              readout('2', '', 'Holdover watch sites', 'red'),
            ])]),
          ], 'CELL L-22'),
        ]),
        el('div.grid.g3', {}, [
          screen('Holdover surveillance', [
            meter('Holdover risk · strike #4 (N. Ridge, 5.2 % fuel)', 84, 'red'),
            meter('Holdover risk · strike #6 (Oak Canyon, 7.4 %)', 61, 'amber'),
            meter('Approach confidence · cell L-22', 72, 'amber'),
            meter('All-clear countdown (30-30 rule)', 35, 'green', '19 min'),
          ], 'CROSS-REFERENCE'),
          screen('Capabilities', [caps([
            ['Storm range sensing', 'An electromagnetic detector estimates storm distance out to about 40 km and rejects man-made noise.'],
            ['Precise geolocation', 'Licensed networks place each cloud-to-ground strike, with polarity and peak current.'],
            ['Holdover hunting', 'Ground strikes on dry fuel become watch sites; cameras and drones revisit them for days.'],
            ['People safety', 'Field crews get a 30-30 rule countdown and an all-clear when the cell passes.'],
          ])], 'SCOPE'),
          screen('Sensor stack', [stack([
            ['AMS AS3935', 'Local strike + storm range', 'I²C → ESP32 · LoRa'],
            ['Vaisala NLDN / GLD360', 'Licensed strike geolocation', 'commercial feed'],
            ['GOES-18 GLM', 'Total lightning from orbit', 'NOAA open data'],
            ['Fuel-moisture join', 'Holdover risk scoring', 'edge model'],
          ])], 'STACK'),
        ]),
        disclaimer(),
      ]);
    },
  },
];
