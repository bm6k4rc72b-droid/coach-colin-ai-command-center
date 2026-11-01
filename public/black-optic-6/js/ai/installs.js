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
  { repo: 'NVIDIA-AI-IOT/nanoowl', section: 'Target lock', status: 'swapped', licence: 'Apache-2.0',
    what: 'nanoOWL is OWL-ViT compiled for TensorRT on a Jetson. The browser runs the same OWL-ViT model through ONNX Runtime Web: type "bolt cutters, white truck, coyote" and it locks.' },
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
  { repo: 'glance-speedlab + PrivateAIModels', section: 'Ask once, answer many', status: 'not-wired', licence: '—',
    what: 'Your repositories are not attached to this session, so nothing was copied from them. Attach them and their measured numbers can replace the batching model.' },
]);

/** Count of entries per status. */
export function installTally() {
  const t = {};
  for (const i of INSTALLS) t[i.status] = (t[i.status] ?? 0) + 1;
  return t;
}
