/**
 * RANCH COMMAND — the twelve slides.
 *
 * Each slide is a heading plus a `render(ctx)` that returns its body. The app
 * owns every live thing — camera elements, connections, the alert queue — and
 * slides only arrange it, so re-rendering a slide never drops a stream.
 *
 * @module ranch-command/slides
 */

import { el, fill, ago } from './dom.js';
import { SOURCE_KINDS, urlProblem } from './streams.js';
import { STACK, WHERE, statusOf } from './stack.js';
import { PRIORITIES } from './events.js';
import { inspectionPlan, distance } from './mavlink.js';

const PRIORITY_TAG = { critical: 'red', high: 'red', medium: 'amber', low: 'gold', info: 'green' };
const WORKFLOWS = [['all', 'All'], ['security', 'Security'], ['livestock', 'Livestock'], ['wildlife', 'Wildlife'], ['review', 'Review']];

/** A KPI tile. */
const kpi = (value, label, tone = '') => el(`div.kpi${tone ? `.${tone}` : ''}`, {}, [el('b', { text: value }), el('span', { text: label })]);

/** A camera picker for the AI stages. */
function cameraPicker(ctx, selected, onChange) {
  const cams = ctx.cameraList();
  if (!cams.length) return el('p.muted', { text: 'No camera is live yet. Add one on the Cameras slide — this iPhone counts.' });
  return el('label.field', {}, ['Feed', el('select', { onchange: (e) => onChange(e.target.value) }, cams.map((c) => el('option', { value: c.id, text: c.name, selected: c.id === selected || null })))]);
}

/* ================================================================ slides */

export const SLIDES = [
  /* ---------------------------------------------------------- 01 command */
  {
    id: 'command',
    kicker: 'Concept architecture · live',
    title: 'Ranch Command // Intelligence Network',
    lede: 'Every camera, drone, radio and model on the property in one command surface. Swipe, wave your hand at the camera, or ask Rafa.',
    render(ctx) {
      const open = ctx.alerts.list({ open: true });
      const loud = open.filter((a) => ['critical', 'high'].includes(a.routing.priority)).length;
      const flying = ctx.fleet.list().filter((v) => v.armed && !v.stale).length;
      return el('div.grid', {}, [
        el('div.grid.g4', {}, [
          el('div.card.foil', {}, [kpi(String(ctx.cameraList().length), 'Cameras live', 'green')]),
          el('div.card.foil', {}, [kpi(String(loud), 'Urgent alerts', loud ? 'red' : '')]),
          el('div.card.foil', {}, [kpi(String(open.length), 'Open alerts')]),
          el('div.card.foil', {}, [kpi(String(flying), 'Drones armed', flying ? 'red' : '')]),
          el('div.card.foil', {}, [kpi(String(ctx.mesh.list().length), 'Mesh nodes', 'green')]),
          el('div.card.foil', {}, [kpi(ctx.health ? `${Object.values(ctx.health.components || {}).filter((c) => c.ok).length}/${Object.keys(ctx.health.components || {}).length}` : '—', 'Edge services up')]),
        ]),
        el('div.card.foil', {}, [
          el('h4', { text: 'Ranch sensor network' }),
          el('div.flow', {}, [
            el('div.flow-row', {}, [
              el('div.flow-node', {}, [el('b', { text: '📷 Thermal + PTZ' }), el('span', { text: 'IP cameras → Frigate' })]),
              el('div.flow-node', {}, [el('b', { text: '🛸 Drone docks' }), el('span', { text: 'ArduPilot · DJI' })]),
              el('div.flow-node', {}, [el('b', { text: '📡 Gate + LoRa' }), el('span', { text: 'Meshtastic · sensors' })]),
              el('div.flow-node', {}, [el('b', { text: '📱 iPhone' }), el('span', { text: 'camera + on-device AI' })]),
            ]),
            el('div.flow-arrow', { text: '▼' }),
            el('div.flow-node.hot', {}, [el('b', { text: 'Edge AI processing · NVIDIA Jetson' }), el('span', { text: 'Frigate · RF-DETR · MegaDetector · NanoOWL · NanoSAM · Cowcatcher' })]),
            el('div.flow-arrow', { text: '▼' }),
            el('div.flow-node.hot', {}, [el('b', { text: 'Ranch Command Dashboard' }), el('span', { text: '3D map · event verification · livestock alerts · human-approved drone dispatch' })]),
            el('div.flow-arrow', { text: '▼' }),
            el('div.flow-row', {}, [
              el('div.flow-node', {}, [el('b', { text: '📱 Owner mobile app' }), el('span', { text: 'this page, installed to the home screen' })]),
              el('div.flow-node', {}, [el('b', { text: '🔔 Verified alerts' }), el('span', { text: 'a person confirms every one' })]),
            ]),
          ]),
        ]),
        el('div.row', {}, [
          el('button.btn.gold', { type: 'button', onclick: () => ctx.tour() }, ['▶ Tour with Rafa']),
          el('button.btn.green', { type: 'button', onclick: () => ctx.addDevice('environment') }, ['📱 Add this iPhone\'s camera']),
          el('button.btn', { type: 'button', onclick: () => ctx.toggleSwipe() }, ['✋ Air Swipe']),
        ]),
        ctx.poweredBy(),
      ]);
    },
  },

  /* ---------------------------------------------------------- 02 cameras */
  {
    id: 'cameras',
    kicker: 'Live feeds',
    title: 'Every camera, one wall',
    lede: 'iPhone lenses, USB cameras and capture cards open directly. IP surveillance cameras and DJI drones arrive through the edge box as WebRTC or HLS, because no browser can open RTSP or RTMP itself.',
    render(ctx) {
      const cams = ctx.cameraList();
      const wall = el('div.cams', {}, cams.length ? cams.map((c) => ctx.cameraTile(c)) : [el('div.cam-empty', {}, [el('div', {}, [el('p', { text: 'No cameras yet.' }), el('button.btn.gold', { type: 'button', onclick: () => ctx.addDevice('environment') }, ['Add this device'])])])]);
      const kind = el('select', {}, SOURCE_KINDS.filter((k) => k.id !== 'device').map((k) => el('option', { value: k.id, text: k.label })));
      const name = el('input', { type: 'text', placeholder: 'Name — e.g. North gate', maxlength: '40' });
      const url = el('input', { type: 'url', placeholder: 'https://…', inputmode: 'url' });
      const zone = el('input', { type: 'text', placeholder: 'Zone — e.g. north_gate, calving_pen' });
      const lat = el('input', { type: 'number', step: 'any', placeholder: 'Latitude (optional)' });
      const lon = el('input', { type: 'number', step: 'any', placeholder: 'Longitude (optional)' });
      const warn = el('p.faint');
      const hint = el('p.faint', { text: SOURCE_KINDS[1].hint });
      kind.addEventListener('change', () => { hint.textContent = SOURCE_KINDS.find((k) => k.id === kind.value).hint; });
      url.addEventListener('input', () => { warn.textContent = url.value ? (urlProblem(url.value) || '') : ''; });
      return el('div.grid', {}, [
        wall,
        el('div.grid.g2', {}, [
          el('div.card.foil', {}, [
            el('h4', { text: 'This device' }),
            el('p.muted', { text: 'On an iPhone: the back camera, the selfie camera, or any lens it exposes. On a laptop: webcams and capture cards — plug a DJI remote\'s HDMI out into a USB capture card and it appears here.' }),
            el('div.row', {}, [
              el('button.btn.gold.sm', { type: 'button', onclick: () => ctx.addDevice('environment') }, ['Back camera']),
              el('button.btn.sm', { type: 'button', onclick: () => ctx.addDevice('user') }, ['Front camera']),
              el('button.btn.sm', { type: 'button', onclick: () => ctx.pickDevice() }, ['Choose device…']),
            ]),
          ]),
          el('div.card.foil', {}, [
            el('h4', { text: 'Network camera or drone' }),
            el('div.grid', {}, [
              name, kind, url, hint, zone,
              el('div.grid.g2', { style: { gridTemplateColumns: '1fr 1fr' } }, [lat, lon]),
              warn,
              el('button.btn.gold.sm', {
                type: 'button',
                onclick: () => {
                  const problem = urlProblem(url.value);
                  if (problem) { ctx.toast(problem); return; }
                  ctx.addNetworkCamera({ name: name.value.trim() || 'Camera', kind: kind.value, url: url.value.trim(), zone: zone.value.trim(), lat: lat.value === '' ? null : Number(lat.value), lon: lon.value === '' ? null : Number(lon.value) });
                },
              }, ['Add camera']),
            ]),
          ]),
        ]),
      ]);
    },
  },

  /* ----------------------------------------------------------- 03 vision */
  {
    id: 'vision',
    kicker: 'AI vision · on this device',
    title: 'It knows a cow from a pickup',
    lede: 'An EfficientDet-Lite0 detector bundled with this page runs right here — on an iPhone, offline, nothing uploaded. On the edge box, MegaDetector V6 and RF-DETR take over with species and ranch-specific classes.',
    render(ctx) {
      const s = ctx.state.vision;
      const counts = el('div.counts', {}, ['person', 'vehicle', 'livestock', 'predator', 'animal'].map((k) => el('div.card', {}, [kpi(String(s.counts[k] || 0), k, k === 'predator' || k === 'person' ? 'red' : k === 'livestock' ? 'green' : '')])));
      ctx.ui.visionCounts = counts;
      return el('div.grid.g2', {}, [
        el('div', {}, [ctx.stage('vision')]),
        el('div.grid', {}, [
          el('div.card.foil', {}, [
            el('h4', { text: 'Feed & detector' }),
            cameraPicker(ctx, s.camera, (id) => { s.camera = id; ctx.render(); }),
            el('div.row', { style: { marginTop: '10px' } }, [
              el('button.btn.gold.sm', { type: 'button', onclick: () => ctx.toggleVision() }, [s.running ? '■ Stop detector' : '▶ Start detector']),
              el('label.row.faint', {}, [el('input', { type: 'checkbox', checked: s.raise || null, onchange: (e) => { s.raise = e.target.checked; } }), 'Raise alerts from this feed']),
            ]),
            el('p.via', { text: s.status || 'Detector idle.' }),
          ]),
          counts,
          el('p.faint', { text: 'This model knows the 80 everyday COCO classes, which cover people, vehicles, cattle, horses, sheep, dogs and bears — but not coyotes, deer or calving. Those come from MegaDetector, a species classifier and Cowcatcher on the edge box.' }),
        ]),
      ]);
    },
  },

  /* ----------------------------------------------------------- 04 search */
  {
    id: 'search',
    kicker: 'NVIDIA NanoOWL · open-vocabulary search',
    title: 'Describe it. It finds it.',
    lede: 'Type what you are looking for — "open gate", "coyote", "downed fence", "smoke". On a Jetson this is NanoOWL on TensorRT. Without one, the same OWL-ViT model runs in this browser after a one-time download.',
    render(ctx) {
      const s = ctx.state.search;
      const prompt = el('input', { type: 'text', value: s.prompt, placeholder: 'open gate, coyote, cattle' });
      const run = () => { s.prompt = prompt.value; ctx.runSearch(); };
      prompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
      return el('div.grid.g2', {}, [
        el('div', {}, [ctx.stage('search')]),
        el('div.grid', {}, [
          el('div.card.foil', {}, [
            el('h4', { text: 'Search a frame' }),
            cameraPicker(ctx, s.camera, (id) => { s.camera = id; ctx.render(); }),
            el('label.field', { style: { marginTop: '10px' } }, ['What to find (comma-separated)', prompt]),
            el('div.chips', { style: { margin: '10px 0' } }, ['open gate', 'coyote', 'downed fence', 'cattle', 'horse', 'truck', 'person', 'smoke', 'water trough'].map((p) => el('button', { type: 'button', onclick: () => { prompt.value = prompt.value ? `${prompt.value}, ${p}` : p; } }, [p]))),
            el('button.btn.gold', { type: 'button', onclick: run, disabled: s.busy || null }, [s.busy ? 'Searching…' : '⌕ Find it']),
            el('p.via', { text: s.status || (ctx.settings.edgeUrl ? 'Will run NanoOWL on the edge box.' : 'No edge box: will run OWL-ViT in this browser (first run downloads the model).') }),
          ]),
          s.results.length ? el('div.card', {}, [el('h4', { text: `${s.results.length} found` }), el('table', {}, [el('tbody', {}, s.results.map((d) => el('tr', {}, [el('td', { text: d.label }), el('td.mono', { text: `${Math.round(d.score * 100)}%` })])))])]) : null,
        ]),
      ]);
    },
  },

  /* ---------------------------------------------------------- 05 segment */
  {
    id: 'segment',
    kicker: 'NVIDIA NanoSAM · segment anything',
    title: 'Tap it. Cut it out.',
    lede: 'Freeze a frame and tap anything — a fence break, a hay bale, a water tank. NanoSAM on the Jetson segments it in real time; without one, SlimSAM does it in the browser.',
    render(ctx) {
      const s = ctx.state.segment;
      return el('div.grid.g2', {}, [
        el('div', {}, [ctx.stage('segment')]),
        el('div.grid', {}, [
          el('div.card.foil', {}, [
            el('h4', { text: 'Segment' }),
            cameraPicker(ctx, s.camera, (id) => { s.camera = id; s.frozen = null; ctx.render(); }),
            el('div.row', { style: { marginTop: '10px' } }, [
              el('button.btn.gold.sm', { type: 'button', onclick: () => ctx.freeze() }, [s.frozen ? '↻ New frame' : '❄ Freeze frame']),
              s.frozen ? el('span.faint', { text: 'Now tap the object.' }) : null,
            ]),
            el('p.via', { text: s.status || (ctx.settings.edgeUrl ? 'Will run NanoSAM on the edge box.' : 'No edge box: will run SlimSAM in this browser.') }),
            s.coverage != null ? kpi(`${s.coverage.toFixed(1)}%`, 'of the frame', 'green') : null,
          ]),
        ]),
      ]);
    },
  },

  /* ----------------------------------------------------------- 06 events */
  {
    id: 'events',
    kicker: 'Verified alerts',
    title: 'Routed, then confirmed by a person',
    lede: 'Detections from Frigate, the edge models and this device are routed by one rulebook: a cow at the gate is a livestock job, a stranger at 2 a.m. is security. Nothing goes out until someone confirms it.',
    render(ctx) {
      const s = ctx.state.events;
      const items = ctx.alerts.list(s.filter === 'all' ? {} : { workflow: s.filter });
      return el('div.grid', {}, [
        el('div.filters', {}, WORKFLOWS.map(([id, label]) => el('button', { type: 'button', class: s.filter === id ? 'on' : '', onclick: () => { s.filter = id; ctx.render(); } }, [`${label} ${id === 'all' ? ctx.alerts.list().length : ctx.alerts.list({ workflow: id }).length}`]))),
        items.length ? el('div.alerts', {}, items.slice(0, 60).map((a) => alertCard(ctx, a))) : el('div.card', {}, [
          el('p', { text: 'No alerts yet.' }),
          el('p.muted', { text: ctx.links.mqtt === 'connected' ? 'Connected to the broker and listening on frigate/events and ranch/events.' : 'Connect the MQTT broker on the Setup slide to receive Frigate and edge alerts, or start the on-device detector with "Raise alerts" ticked.' }),
          el('button.btn.sm', { type: 'button', onclick: () => ctx.demoAlerts() }, ['Load sample alerts']),
        ]),
      ]);
    },
  },

  /* -------------------------------------------------------- 07 livestock */
  {
    id: 'livestock',
    kicker: 'Livestock · calving watch',
    title: 'The herd, counted. Calving, flagged.',
    lede: 'Cattle, horses and sheep seen by every camera, and calving detected by Cowcatcher and Calvingcatcher on the edge box — bumped straight to critical, because cows do not wait for morning.',
    render(ctx) {
      const stock = ctx.alerts.list({ workflow: 'livestock' });
      const calving = stock.filter((a) => a.routing.rule === 'calving');
      const byCam = new Map();
      for (const c of ctx.cameraList()) byCam.set(c.name, ctx.state.vision.perCamera[c.id]?.livestock || 0);
      return el('div.grid', {}, [
        el('div.grid.g4', {}, [
          el('div.card.foil', {}, [kpi(String(calving.filter((a) => !a.verdict).length), 'Calving now', calving.length ? 'red' : 'green')]),
          el('div.card.foil', {}, [kpi(String(stock.filter((a) => a.routing.rule === 'stock-at-gate' && !a.verdict).length), 'Stock at gates', '')]),
          el('div.card.foil', {}, [kpi(String([...byCam.values()].reduce((a, b) => a + b, 0)), 'In view now', 'green')]),
        ]),
        el('div.grid.g2', {}, [
          el('div.card', {}, [
            el('h4', { text: 'Head in view, by camera' }),
            byCam.size ? el('table', {}, [el('tbody', {}, [...byCam].map(([name, n]) => el('tr', {}, [el('td', { text: name }), el('td.mono', { text: String(n) })])))]) : el('p.muted', { text: 'Add a camera and start the detector on the Vision slide.' }),
          ]),
          el('div.card', {}, [
            el('h4', { text: 'Calving & gate events' }),
            stock.length ? el('div.alerts', {}, stock.slice(0, 8).map((a) => alertCard(ctx, a))) : el('p.muted', { text: 'Calving detection runs on the edge box (Cowcatcher + Calvingcatcher). Its events arrive here on ranch/events.' }),
          ]),
        ]),
      ]);
    },
  },

  /* ----------------------------------------------------------- 08 drones */
  {
    id: 'drones',
    kicker: 'Drone ops · human-approved dispatch',
    title: 'Every aircraft. A pilot decides.',
    lede: 'ArduPilot and PX4 telemetry through mavlink2rest (works on iPhone) or straight from a USB telemetry radio. DJI video through MediaMTX or an HDMI capture card. This page drafts missions; a remote pilot reviews and uploads them.',
    render(ctx) {
      const vehicles = ctx.fleet.list();
      const s = ctx.state.drones;
      // Telemetry re-renders this slide twice a second, so everything typed
      // or ticked lives in state, not in the inputs, or it would vanish
      // under the pilot's fingers.
      s.form ??= { lat: s.target?.lat ?? '', lon: s.target?.lon ?? '', checks: [false, false, false, false] };
      if (s.target && s.form.lat === '' && s.form.lon === '') { s.form.lat = s.target.lat; s.form.lon = s.target.lon; }
      const keep = (key) => (e) => { s.form[key] = e.target.value; };
      const latIn = el('input', { type: 'number', step: 'any', value: s.form.lat, placeholder: 'Target latitude', oninput: keep('lat') });
      const lonIn = el('input', { type: 'number', step: 'any', value: s.form.lon, placeholder: 'Target longitude', oninput: keep('lon') });
      const altIn = el('input', { type: 'number', min: '10', max: '120', value: s.altitude, oninput: (e) => { s.altitude = e.target.value; } });
      const checks = [
        'I am the remote pilot in command, and qualified for this operation.',
        'Airspace, weather and any required authorisation are checked.',
        'The flight stays within visual line of sight, or I hold a waiver.',
        'Nobody is in the path, and livestock will not be stampeded.',
      ];
      const boxes = checks.map((t, i) => el('input', { type: 'checkbox', checked: s.form.checks[i] || null, onchange: (e) => { s.form.checks[i] = e.target.checked; } }));
      return el('div.grid.g2', {}, [
        el('div.grid', {}, [
          el('div.card.foil', {}, [
            el('h4', { text: 'Telemetry link' }),
            el('p.muted', { text: ctx.links.mavlink === 'connected' ? `Connected — ${vehicles.length} aircraft.` : 'Not connected. Set the mavlink2rest URL on Setup, or use a USB radio.' }),
            el('div.row', {}, [
              el('button.btn.sm', { type: 'button', onclick: () => ctx.connectMavlink() }, ['Connect mavlink2rest']),
              'serial' in navigator ? el('button.btn.sm', { type: 'button', onclick: () => ctx.connectSerial() }, ['USB telemetry radio']) : el('span.faint', { text: 'USB radio needs desktop Chrome or Edge.' }),
            ]),
          ]),
          vehicles.length ? el('div.grid', {}, vehicles.map((v) => droneCard(ctx, v))) : el('div.card', {}, [el('p.muted', { text: 'No aircraft heard yet.' })]),
          el('div.card', {}, [
            el('h4', { text: 'DJI drones' }),
            el('p.muted', { text: 'DJI aircraft do not speak MAVLink. Their video joins via RTMP live-streaming (DJI Fly or Pilot 2) into MediaMTX — then add its HLS or WHEP URL on Cameras — or via the controller\'s HDMI out into a capture card. Flight control stays in the DJI app.' }),
          ]),
        ]),
        el('div.card.foil', {}, [
          el('h4', { text: 'Draft an inspection mission' }),
          el('p.muted', { text: 'Take off from home, fly to the target, loiter 30 s, return to launch. Downloads a QGroundControl .plan for the pilot to review, upload and fly. Nothing is sent to an aircraft from here.' }),
          el('div.grid.g2', { style: { gridTemplateColumns: '1fr 1fr' } }, [latIn, lonIn]),
          el('label.field', { style: { marginTop: '8px' } }, ['Altitude (m, 10–120)', altIn]),
          s.target ? el('p.faint', { text: `${Math.round(distance(ctx.settings.home, s.target))} m from home${s.reason ? ` · ${s.reason}` : ''}` }) : null,
          el('div.checks', {}, checks.map((t, i) => el('label', {}, [boxes[i], t]))),
          el('button.btn.gold', {
            type: 'button',
            onclick: () => {
              if (!s.form.checks.every(Boolean)) { ctx.toast('All four checks are required. That is the human approval.'); return; }
              if (String(s.form.lat).trim() === '' || String(s.form.lon).trim() === '') { ctx.toast('Enter the target\'s latitude and longitude, or use "Plan drone check" on an alert.'); return; }
              try {
                const target = { lat: Number(s.form.lat), lon: Number(s.form.lon) };
                const plan = inspectionPlan({ home: ctx.settings.home, target, altitude: Number(s.altitude) });
                s.form.checks = [false, false, false, false];
                ctx.download(`inspection-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.plan`, JSON.stringify(plan, null, 2));
                // The approval covers one mission; the boxes clear for the next.
                ctx.render();
                ctx.rafa.say({ en: 'Mission drafted. Load it in QGroundControl, look it over, and fly safe, [es:jefe].', es: 'Misión lista. Ábrela en QGroundControl, revísala y vuela con cuidado, jefe.' });
              } catch (error) {
                ctx.toast(error.message);
              }
            },
          }, ['⬇ Download mission for the pilot']),
        ]),
      ]);
    },
  },

  /* -------------------------------------------------------------- 09 map */
  {
    id: 'map',
    kicker: '3D ranch · OpenDroneMap ready',
    title: 'The whole ranch, in three dimensions',
    lede: 'Cameras in gold, aircraft in red, radios in green, placed from their real coordinates around home. Process a drone survey in OpenDroneMap and drape its orthophoto here to see the actual land.',
    render(ctx) {
      const wrap = ctx.mapView();
      return el('div.grid', {}, [
        wrap,
        el('div.row', {}, [
          el('div.legend', {}, [el('span', {}, [el('i', { style: { background: 'var(--gold)' } }), 'Cameras · HQ']), el('span', {}, [el('i', { style: { background: 'var(--red)' } }), 'Aircraft · alerts']), el('span', {}, [el('i', { style: { background: 'var(--green)' } }), 'Radios · sensors'])]),
          el('span.spacer'),
          el('span.faint', { text: 'Drag to turn · tilt your phone with Tilt on' }),
        ]),
      ]);
    },
  },

  /* ------------------------------------------------------------- 10 mesh */
  {
    id: 'mesh',
    kicker: 'Off-grid · Meshtastic + field sensors',
    title: 'Past the last bar of signal',
    lede: 'Meshtastic LoRa radios report position, battery and weather, and relay texts, across miles with no cell coverage. Solar field stations publish on ranch/sensors/#. Both reach this page over MQTT.',
    render(ctx) {
      const nodes = ctx.mesh.list();
      return el('div.grid', {}, [
        el('div.grid.g4', {}, [
          el('div.card.foil', {}, [kpi(String(nodes.filter((n) => !n.stale).length), 'Nodes heard (30 min)', 'green')]),
          el('div.card.foil', {}, [kpi(String(nodes.filter((n) => Number.isFinite(n.battery) && n.battery < 25).length), 'Low battery', 'red')]),
          el('div.card.foil', {}, [kpi(ctx.links.mqtt === 'connected' ? 'LIVE' : 'OFF', 'Broker', ctx.links.mqtt === 'connected' ? 'green' : 'red')]),
        ]),
        el('div.card', {}, [
          nodes.length ? el('div.scroll-x', {}, [el('table', {}, [
            el('thead', {}, [el('tr', {}, ['Node', 'Battery', 'Temp', 'Signal', 'Position', 'Heard', 'Last message'].map((h) => el('th', { text: h })))]),
            el('tbody', {}, nodes.map((n) => el('tr', {}, [
              el('td', {}, [el('b', { text: n.name }), n.short ? el('span.faint', { text: ` ${n.short}` }) : null]),
              el('td.mono', { text: Number.isFinite(n.battery) ? `${n.battery}%` : Number.isFinite(n.voltage) ? `${n.voltage.toFixed(2)} V` : '—' }),
              el('td.mono', { text: Number.isFinite(n.temperature) ? `${n.temperature.toFixed(1)}°C` : '—' }),
              el('td.mono', { text: Number.isFinite(n.snr) ? `${n.snr} dB SNR` : '—' }),
              el('td.mono', { text: Number.isFinite(n.lat) ? `${n.lat.toFixed(5)}, ${n.lon.toFixed(5)}` : '—' }),
              el('td', { text: ago(n.seen) }),
              el('td', { text: n.lastText || '' }),
            ]))),
          ])]) : el('div', {}, [
            el('p', { text: 'No radios heard yet.' }),
            el('p.muted', { text: 'On each Meshtastic node: enable the MQTT module, point it at your broker, and turn on JSON output. This page subscribes to msh/# and ranch/sensors/#.' }),
            el('button.btn.sm', { type: 'button', onclick: () => ctx.demoMesh() }, ['Load sample radios']),
          ]),
        ]),
      ]);
    },
  },

  /* ------------------------------------------------------------ 11 stack */
  {
    id: 'stack',
    kicker: 'Under the hood',
    title: 'The stack, and where each piece runs',
    lede: 'Every project from the research, labelled with where it actually runs and how this dashboard reaches it. Live status comes from the edge box when one is connected. Licences matter if you sell this as a service — they are listed, not hidden.',
    render(ctx) {
      const status = statusOf(ctx.health);
      const groups = Object.keys(WHERE).map((where) => [where, STACK.filter((s) => s.where === where)]).filter(([, items]) => items.length);
      return el('div.grid', {}, [
        ctx.poweredBy(),
        el('div.grid.g2', {}, groups.map(([where, items]) => el('div.card.foil', {}, [
          el('h4', { text: WHERE[where] }),
          ...items.map((item) => {
            const st = status.get(item.id);
            return el('div.stack-item', {}, [
              el('span', { class: `stack-dot ${st.ok === true ? 'ok' : st.ok === false ? 'bad' : ''}` }),
              el('div', {}, [
                el('h3', {}, [item.url ? el('a', { href: item.url, target: '_blank', rel: 'noopener', text: item.name }) : item.name, item.nvidia ? el('span.tag.green', { text: 'NVIDIA', style: { marginLeft: '8px' } }) : null]),
                el('p', { text: item.role }),
                el('p.faint', { text: `${item.link} · ${item.license} · ${st.detail}` }),
              ]),
            ]);
          }),
        ]))),
        el('div.card', {}, [
          el('h4', { text: 'Install the edge box' }),
          el('p.muted', { text: 'The edge stack lives in this repository at edge/ranch-command: one script for a Jetson (JetPack 6) or an x86 PC with an NVIDIA GPU, a docker-compose for Frigate, Mosquitto, MediaMTX and mavlink2rest, and the ranch-edge service that runs NanoOWL, NanoSAM, MegaDetector, RF-DETR and Cowcatcher and serves this page\'s /v1 API.' }),
        ]),
      ]);
    },
  },

  /* ------------------------------------------------------------ 12 setup */
  {
    id: 'setup',
    kicker: 'Connect · calibrate',
    title: 'Plug in the ranch',
    lede: 'Point the dashboard at the edge box, teach Air Swipe your hand, and choose how Rafa sounds. Everything here is stored on this device only.',
    render(ctx) {
      const st = ctx.settings;
      const input = (key, placeholder, type = 'url') => el('input', { type, value: st[key] || '', placeholder, onchange: (e) => { st[key] = e.target.value.trim(); ctx.saveSettings(); } });
      const g = st.gesture;
      return el('div.grid.g2', {}, [
        el('div.card.foil', {}, [
          el('h4', { text: 'Connections' }),
          el('div.grid', {}, [
            el('label.field', {}, ['Edge box (ranch-edge API)', input('edgeUrl', 'https://ranch-edge.your-tailnet.ts.net')]),
            el('label.field', {}, ['MQTT over WebSocket', input('mqttUrl', 'wss://ranch-edge.your-tailnet.ts.net:8884/mqtt')]),
            el('div.grid.g2', { style: { gridTemplateColumns: '1fr 1fr' } }, [
              el('label.field', {}, ['MQTT user', input('mqttUser', 'dashboard', 'text')]),
              el('label.field', {}, ['MQTT password', input('mqttPass', '••••', 'password')]),
            ]),
            el('label.field', {}, ['mavlink2rest WebSocket', input('mavlinkUrl', 'wss://…/v1/ws/mavlink')]),
            el('label.field', {}, ['OpenDroneMap orthophoto (PNG/JPEG URL)', input('orthophotoUrl', 'https://…/odm_orthophoto.png')]),
            el('div.grid.g2', { style: { gridTemplateColumns: '1fr 1fr' } }, [
              el('label.field', {}, ['Home latitude', el('input', { type: 'number', step: 'any', value: st.home.lat, onchange: (e) => { st.home.lat = Number(e.target.value); ctx.saveSettings(); } })]),
              el('label.field', {}, ['Home longitude', el('input', { type: 'number', step: 'any', value: st.home.lon, onchange: (e) => { st.home.lon = Number(e.target.value); ctx.saveSettings(); } })]),
            ]),
            el('div.row', {}, [
              el('button.btn.gold.sm', { type: 'button', onclick: () => ctx.connectAll() }, ['Connect']),
              el('button.btn.sm', { type: 'button', onclick: () => navigator.geolocation?.getCurrentPosition((p) => { st.home = { lat: p.coords.latitude, lon: p.coords.longitude }; ctx.saveSettings(); ctx.render(); ctx.toast('Home set to where you are standing.'); }, () => ctx.toast('Location was not available.')) }, ['Set home here']),
            ]),
            el('p.faint', { text: 'This page is HTTPS, so every address above must be HTTPS or WSS. Tailscale Serve or a Cloudflare tunnel on the edge box gives you that in one command — see edge/ranch-command/README.md.' }),
          ]),
        ]),
        el('div.grid', {}, [
          el('div.card.foil', {}, [
            el('h4', { text: 'Air Swipe' }),
            el('p.muted', { text: 'Wave your hand sideways in front of the camera to change slides. Hand mode tracks your fingers with an on-device model; Motion mode follows any movement, for gloves or a dark barn.' }),
            el('div.row', {}, [
              el('button.btn.sm', { type: 'button', class: g.enabled ? 'green' : '', onclick: () => ctx.toggleSwipe() }, [g.enabled ? 'On' : 'Off']),
              el('select', { style: { width: 'auto' }, onchange: (e) => { g.mode = e.target.value; ctx.saveSettings(); ctx.restartSwipe(); } }, [el('option', { value: 'hand', text: 'Hand tracking', selected: g.mode === 'hand' || null }), el('option', { value: 'motion', text: 'Motion', selected: g.mode === 'motion' || null })]),
              el('select', { style: { width: 'auto' }, onchange: (e) => { g.camera = e.target.value; ctx.saveSettings(); ctx.restartSwipe(); } }, [el('option', { value: 'user', text: 'Front camera', selected: g.camera === 'user' || null }), el('option', { value: 'environment', text: 'Back camera', selected: g.camera === 'environment' || null })]),
              el('label.row.faint', {}, [el('input', { type: 'checkbox', checked: g.invert || null, onchange: (e) => { g.invert = e.target.checked; ctx.saveSettings(); ctx.restartSwipe(); } }), 'Invert']),
            ]),
            el('p.faint', { text: g.quality != null ? `Calibrated · quality ${g.quality}/100` : 'Not calibrated yet — using defaults.' }),
            el('button.btn.gold.sm', { type: 'button', onclick: () => ctx.calibrate() }, ['Calibrate to my hand']),
          ]),
          el('div.card.foil', {}, [
            el('h4', { text: 'Rafa' }),
            el('div.row', {}, [
              el('select', { style: { width: 'auto' }, onchange: (e) => { st.voice.mode = e.target.value; ctx.rafa.mode = e.target.value; ctx.saveSettings(); ctx.rafa.quip('next'); } }, [
                el('option', { value: 'bilingual', text: 'Bilingüe — English + Spanish', selected: st.voice.mode === 'bilingual' || null }),
                el('option', { value: 'acento', text: 'Acento — Spanish voice, English words', selected: st.voice.mode === 'acento' || null }),
                el('option', { value: 'espanol', text: 'Español', selected: st.voice.mode === 'espanol' || null }),
              ]),
              el('label.row.faint', {}, [el('input', { type: 'checkbox', checked: st.voice.narrate || null, onchange: (e) => { st.voice.narrate = e.target.checked; ctx.saveSettings(); } }), 'Narrate each slide']),
            ]),
            el('p.faint', { text: `Voices on this device — English: ${ctx.rafa.describe().en} · Spanish: ${ctx.rafa.describe().es}. On iPhone, Settings → Accessibility → Spoken Content → Voices adds better ones (try “Juan” or an Enhanced voice).` }),
            el('button.btn.sm', { type: 'button', onclick: () => ctx.rafa.quip('joke') }, ['Tell me a joke']),
          ]),
        ]),
      ]);
    },
  },
];

/* ========================================================= shared parts */

/**
 * An alert card.
 *
 * @param {object} ctx App context.
 * @param {object} a The alert.
 * @returns {HTMLElement} The card.
 */
export function alertCard(ctx, a) {
  const snap = a.snapshotUrl || (a.source === 'frigate' && a.snapshot && ctx.settings.edgeUrl ? `${ctx.settings.edgeUrl.replace(/\/$/, '')}/v1/frigate/events/${encodeURIComponent(a.frigateId)}/snapshot.jpg` : null);
  const cam = ctx.cameraByName(a.camera);
  return el('article.alert', { 'data-priority': a.routing.priority, 'data-verdict': a.verdict || null }, [
    snap ? el('img', { src: snap, alt: '', loading: 'lazy' }) : el('div', { style: { width: '8px' } }),
    el('div', {}, [
      el('div.row', {}, [
        el(`span.tag.${PRIORITY_TAG[a.routing.priority]}`, { text: a.routing.priority }),
        el('span.tag', { text: a.routing.workflow }),
        el('h3', { text: `${a.label} · ${a.camera}` }),
      ]),
      el('p', { text: a.routing.reason }),
      el('p.faint', { text: `${Math.round(a.score * 100)}% · ${a.zones.length ? a.zones.join(', ') : 'no zone'} · ${a.source}${a.models?.length ? ` + ${a.models.join(', ')}` : ''} · ${ago(a.start * 1000)}${a.verdict ? ` · ${a.verdict}` : ''}` }),
    ]),
    el('div.act', {}, a.verdict ? [] : [
      el('button.btn.green.sm', { type: 'button', onclick: () => { ctx.alerts.verify(a.id, 'confirmed'); ctx.render(); } }, ['Confirm']),
      el('button.btn.ghost.sm', { type: 'button', onclick: () => { ctx.alerts.verify(a.id, 'dismissed'); ctx.render(); } }, ['Dismiss']),
      (a.routing.workflow === 'security' || a.routing.workflow === 'wildlife') && cam && Number.isFinite(cam.lat)
        ? el('button.btn.red.sm', { type: 'button', onclick: () => { ctx.state.drones.target = { lat: cam.lat, lon: cam.lon }; ctx.state.drones.form = null; ctx.state.drones.reason = `${a.label} at ${a.camera}`; ctx.goTo('drones'); } }, ['Plan drone check'])
        : null,
    ]),
  ]);
}

/**
 * An aircraft card.
 *
 * @param {object} ctx App context.
 * @param {object} v The vehicle.
 * @returns {HTMLElement} The card.
 */
function droneCard(ctx, v) {
  const stat = (value, label) => el('div.stat', {}, [el('b', { text: value }), el('span', { text: label })]);
  return el(`div.card.drone${v.armed ? '.threat' : ''}`, {}, [
    el('div.row', {}, [
      el('div.horizon', {}, [el('i', { style: { transform: `translateY(${Math.max(-40, Math.min(40, v.pitch * 60))}px) rotate(${-v.roll}rad)` } })]),
      el('div', {}, [
        el('h3', { text: `${v.kind} · system ${v.sysid}` }),
        el('div.row', {}, [el(`span.tag.${v.armed ? 'red' : 'green'}`, { text: v.armed ? 'armed' : 'disarmed' }), el('span.tag.gold', { text: v.mode }), el('span.tag', { text: v.state }), v.stale ? el('span.tag.amber', { text: 'stale' }) : null]),
      ]),
    ]),
    el('div.stats', {}, [
      stat(v.battery != null ? `${v.battery}%` : v.voltage != null ? `${v.voltage.toFixed(1)}V` : '—', 'battery'),
      stat(v.alt != null ? `${v.alt.toFixed(1)} m` : '—', 'altitude'),
      stat(v.speed != null ? `${v.speed.toFixed(1)} m/s` : '—', 'speed'),
      stat(v.heading != null ? `${Math.round(v.heading)}°` : '—', 'heading'),
      stat(v.sats != null ? `${v.sats} · ${v.fix}` : '—', 'GPS'),
      stat(v.lat != null ? `${v.lat.toFixed(5)}` : '—', 'lat'),
      stat(v.lon != null ? `${v.lon.toFixed(5)}` : '—', 'lon'),
    ]),
  ]);
}

export { PRIORITIES, fill };
