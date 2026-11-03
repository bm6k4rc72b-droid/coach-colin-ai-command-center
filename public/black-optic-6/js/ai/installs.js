/**
 * The install ledger: every repository asked for, what it became in this
 * console, and the plain reason when it could not come into a browser.
 *
 * Status meanings:
 * - `wired`    — runs in this console now (on this device, or talking to your kit).
 * - `swapped`  — the repo itself cannot run in a browser; a browser-native
 *                equivalent doing the same job is wired instead, named here.
 * - `kit`      — runs on your Jetson / PC / drone; the console reads its output.
 * - `not-wired`— not installed, with the reason.
 *
 * @module black-optic-6/ai/installs
 */

export const STATUS = Object.freeze({
  wired: { label: 'Wired', tone: 'confirm' },
  swapped: { label: 'Browser equivalent', tone: 'primary' },
  kit: { label: 'Runs on your kit', tone: 'caution' },
  'not-wired': { label: 'Not wired', tone: 'muted' },
});

export const INSTALLS = Object.freeze([
  // ---- Optics · Calibration · Target lock
  { repo: 'DepthAnything/Depth-Anything-V2', section: 'Optics · Calibration', status: 'wired', licence: 'Apache-2.0 (Small); Base/Large are CC-BY-NC-4.0',
    what: 'Small model in the browser (transformers.js, WebGPU → WASM). Click the ground or anything standing on it to get metres; tilt calibrates itself from the ground plane, height from one tape-measured click.' },
  { repo: 'ByteDance-Seed/Depth-Anything-3', section: 'Optics · Calibration', status: 'kit', licence: 'see repo (model-dependent)',
    what: 'Depth Anything 3 is published by ByteDance Seed, not facebookresearch. It runs on a GPU (the Jetson ROS 2 node); paste any metric ONNX depth model into the model box and the console solves BOTH height and tilt from it.' },
  { repo: 'IDEA-Research/GroundingDINO', section: 'Target lock', status: 'wired', licence: 'Apache-2.0',
    what: 'Selectable as the open-vocabulary detector (Grounding DINO tiny, ONNX). Heavier than OWL-ViT; best on a laptop with WebGPU.' },
  { repo: 'NVIDIA-AI-IOT/nanoowl', section: 'Target lock', status: 'wired', licence: 'Apache-2.0',
    what: 'NanoOWL\u2019s tree prompts, ported from its tree.py: [ ] finds, ( ) classifies, nesting looks inside each find — "[a person [a face (smiling, frowning)], a truck]". Runs the same two models NanoOWL uses, OWL-ViT and CLIP, in the browser. The TensorRT engines themselves are Jetson-only; on a Jetson NanoOWL is several times faster.' },
  { repo: 'NVIDIA-AI-IOT/nanosam', section: 'Target lock', status: 'wired', licence: 'Apache-2.0',
    what: 'Tap-to-tag can run NanoSAM: NVIDIA\u2019s ResNet18 image encoder distilled from MobileSAM plus MobileSAM\u2019s mask decoder, through ONNX Runtime Web, with predictor.py\u2019s exact pre- and post-processing. Pick the two ONNX files NVIDIA publishes from your device once; they are not bundled because they are hosted on Google Drive.' },
  { repo: 'facebookresearch/sam2', section: 'Target lock', status: 'swapped', licence: 'Apache-2.0',
    what: 'SAM 2’s video memory tracker needs a GPU in PyTorch. The browser runs a SAM-family click-to-mask segmenter, re-prompts it on the tracked box, and carries a persistent ID across feeds by colour signature (Modelled).' },
  { repo: 'ultralytics/ultralytics (YOLOv8 + ByteTrack)', section: 'Target lock', status: 'wired', licence: 'AGPL-3.0 — your exported weights inherit it',
    what: 'Load your own YOLOv8n .onnx export and the console decodes its head and tracks with ByteTrack. Not bundled: AGPL would bind this whole site. COCO-SSD (Apache-2.0) is the default; RF-DETR (Apache-2.0) is the clean upgrade.' },
  // ---- Twin · Coverage · Aircraft
  { repo: 'eclipse-zenoh/zenoh', section: 'Ranch twin · Links', status: 'wired', licence: 'EPL-2.0 / Apache-2.0',
    what: 'Subscribes to your zenohd router through its REST plugin (Server-Sent Events) — positions on ranch/** go straight onto the aircraft panel.' },
  { repo: 'foxglove/studio', section: 'Ranch twin', status: 'swapped', licence: 'MPL-2.0 (archived)',
    what: 'The open-source Studio was archived in 2024. Lichtblick (lichtblick-suite/lichtblick) is the maintained open fork; the console embeds yours with your foxglove_bridge URL.' },
  { repo: 'PX4/PX4-Autopilot + mavlink/MAVSDK', section: 'Your own aircraft', status: 'wired', licence: 'BSD-3-Clause',
    what: 'The browser reads MAVLink v1/v2 from the Pixhawk 6C over Web Serial (USB or SiK radio): heartbeat, GPS, position, attitude. Read-only on purpose. MAVSDK needs its native server, so it stays on the laptop.' },
  { repo: 'isl-org/Open3D + TixiaoShan/LIO-SAM', section: 'Ranch twin · Coverage', status: 'kit', licence: 'MIT / BSD-3-Clause',
    what: 'LIO-SAM builds the Ouster map on the X500’s Jetson. The console opens the .pcd it saves (ascii, binary or compressed) and turns it into a real occupancy map.' },
  // ---- Acoustic · Impulses · Seismic
  { repo: 'tensorflow/models — YAMNet', section: 'Acoustic watch', status: 'wired', licence: 'Apache-2.0',
    what: 'YAMNet TFLite, bundled with this site, runs through MediaPipe on this device — works offline. Ranch events mapped from its 521 classes, each graded direct or proxy.' },
  { repo: 'kahst/BirdNET-Analyzer', section: 'Acoustic watch', status: 'not-wired', licence: 'Models CC BY-NC-SA 4.0',
    what: 'Non-commercial licence on the models, and it is a bird specialist. Run BirdNET-Pi on a Pi for the birds; YAMNet covers gunshot, chainsaw, vehicles and livestock here.' },
  { repo: 'Geophone classifier', section: 'Seismic', status: 'wired', licence: '—',
    what: 'A phone laid on a post footing becomes a geophone: STA/LTA triggering, cadence and dominant frequency → footsteps, vehicle or impact (Modelled). An SM-24 on Web Serial uses the same code.' },
  { repo: 'meshtastic/firmware', section: 'Response · Blackout', status: 'wired', licence: 'GPL-3.0 (on the radios)',
    what: 'The firmware runs on the LoRa radios. The console talks to a node over Web Serial: "gate 3 open" texts arrive and raise events, and you can send one — with Starlink down.' },
  // ---- Thermal · Vegetation · Orbital
  { repo: 'microsoft/torchgeo', section: 'Vegetation · Orbital', status: 'swapped', licence: 'MIT',
    what: 'TorchGeo is a Python training library. The console does the ranch job directly: Sentinel-2 L2A from Earth Search, NDVI and NDMI over your fence line, worst cells, cached for offline.' },
  { repo: 'groupgets/purethermal + OpenCV thermal', section: 'Thermal palettes', status: 'wired', licence: 'MIT / Apache-2.0',
    what: 'Auto isotherm by Otsu’s method and hot-blob labelling, in plain JavaScript (no OpenCV.js download needed for two algorithms). A PureThermal shows up as a UVC camera; browsers get its 8-bit AGC video, not the 16-bit radiometric stream.' },
  // ---- Vault · Rules · Ask once
  { repo: 'paulmillr/noble-hashes', section: 'Evidence vault', status: 'wired', licence: 'MIT',
    what: 'BLAKE3 on every recorded second as it arrives, chained; each kept clip gets a manifest and an IPFS CID.' },
  { repo: 'ipfs/js-ipfs', section: 'Evidence vault', status: 'swapped', licence: 'MIT / Apache-2.0',
    what: 'js-ipfs is retired; Helia replaced it. The console computes the content address (CIDv1, BLAKE3) itself, so a clip can be pinned with Helia or Kubo later and checked by anyone.' },
  { repo: 'ollama/ollama', section: 'Ask once, answer many', status: 'wired', licence: 'MIT',
    what: 'One request, one frame, every question, JSON-schema answers, Ollama’s own timings — answers hashed into the evidence chain.' },
  { repo: 'langchain-ai/langchainjs', section: 'Ask once, answer many', status: 'not-wired', licence: 'MIT',
    what: 'Not needed for one structured call to a local model, so not loaded.' },
  // ---- Site scan (3D building & site intelligence)
  { repo: 'openstreetmap + drolbr/Overpass-API', section: 'Site scan', status: 'wired', licence: 'Data ODbL 1.0 (attribution shown)',
    what: 'Every building footprint in range, with its mapped height or levels, fetched live and rebuilt in 3D. Heights that nobody mapped are assumed by building type and shown in grey.' },
  { repo: 'osm-search/Nominatim', section: 'Site scan', status: 'wired', licence: 'GPL-2.0 (service); data ODbL',
    what: 'Find any address or landmark, then scan around it.' },
  { repo: 'microsoft/GlobalMLBuildingFootprints', section: 'Site scan', status: 'wired', licence: 'ODbL',
    what: 'Import its GeoJSON — over a billion machine-traced footprints, many with height estimates — where OpenStreetMap is thin. Its "no estimate" (−1) heights are not trusted.' },
  { repo: 'mourner/suncalc + NOAA solar position', section: 'Site scan', status: 'wired', licence: 'BSD-2-Clause / public domain',
    what: 'Sun position by NOAA\u2019s algorithm (within 0.01° of NREL SPA, with refraction), sunrise and sunset by SunCalc; exact ray-traced sun-hours over the site.' },
  { repo: 'mrdoob/three.js (with mapbox/earcut)', section: 'Site scan', status: 'wired', licence: 'MIT / ISC',
    what: 'The 3D rebuild with real-time sun shadows; tap a building to analyse it.' },
  { repo: 'open-meteo/open-meteo', section: 'Site scan', status: 'wired', licence: 'AGPL-3.0 server; data CC BY 4.0',
    what: 'Last year\u2019s daily temperature and solar radiation for heating/cooling degree days and real rooftop-solar yield.' },
  { repo: 'SFPE hydraulic model + IBC 2021 Table 1004.5', section: 'Site scan', status: 'wired', licence: 'published methods',
    what: 'Occupant load per building and time to get out (pre-movement, travel, queueing at doors or stairs), then Dijkstra people-flow around the buildings to the assembly point.' },
  { repo: 'Cadastre / land parcels', section: 'Site scan', status: 'not-wired', licence: '—',
    what: 'There is no worldwide open parcel layer; boundaries are not drawn rather than guessed. Your fence on the perimeter deck is the boundary this console knows.' },
  // ---- Voice · Scene description
  { repo: 'openai/whisper', section: 'Say it · voice command', status: 'wired', licence: 'MIT (code and weights)',
    what: 'Whisper base.en and tiny.en run on this device through transformers.js: hold the button, speak, and the command is carried out. Useful Sensors’ Moonshine tiny (MIT) is the default because it is several times faster than Whisper on a few-second command; switch to Whisper in the panel. The Python repo itself needs PyTorch, so its ONNX export is what runs here.' },
  { repo: 'microsoft/Florence-2', section: 'Describe the scene', status: 'wired', licence: 'MIT',
    what: 'Florence-2 base (fine-tuned) in the browser: describes the frame in plain words, lists and boxes objects, finds what a phrase names. WebGPU runs fp16 vision with a 4-bit language model; WASM runs 8-bit. Replaces glance-speedlab for the rancher demo. "What do you see?" by voice asks it.' },
  { repo: 'glance-speedlab + PrivateAIModels', section: 'Ask once, answer many', status: 'swapped', licence: '—',
    what: 'Not attached to this session, so nothing was copied from them. Florence-2 on the Watch deck now does the scene description they were meant to demo, on the device; Ollama "Ask once" stays for a bigger local VLM.' },
]);

/** Count of entries per status. */
export function installTally() {
  const t = {};
  for (const i of INSTALLS) t[i.status] = (t[i.status] ?? 0) + 1;
  return t;
}
