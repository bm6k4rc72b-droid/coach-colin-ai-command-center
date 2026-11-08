/**
 * RANCH COMMAND — the stack, honestly labelled.
 *
 * Every project from the research, where it runs, how this dashboard talks
 * to it, and its licence. `where` is one of:
 *
 * - `device` — bundled with this page and running in the browser now;
 * - `edge` — installed on the ranch's edge box by `edge/ranch-command`;
 * - `aircraft` / `radio` — firmware on hardware the dashboard reads from;
 * - `reference` — named in the research but not wired in, with the reason.
 *
 * `health` names the key the edge service reports this component under, so
 * the stack slide can show live status instead of a claim.
 *
 * A `url` of null means the project could not be verified from here; it is
 * left blank rather than guessed.
 *
 * @module ranch-command/stack
 */

export const STACK = [
  { id: 'mediapipe', name: 'MediaPipe (EfficientDet-Lite0 + Hand Landmarker)', where: 'device', role: 'On-phone detection of people, vehicles and livestock, and the hand tracking behind Air Swipe.', link: 'Bundled; runs offline', license: 'Apache-2.0', url: 'https://github.com/google-ai-edge/mediapipe' },
  { id: 'frigate', name: 'Frigate NVR', where: 'edge', role: 'Records every IP camera, runs object detection, publishes events to MQTT.', link: 'MQTT frigate/events · REST', license: 'MIT', url: 'https://github.com/blakeblackshear/frigate', health: 'frigate' },
  { id: 'go2rtc', name: 'go2rtc (inside Frigate)', where: 'edge', role: 'Turns RTSP camera streams into WebRTC the browser can play.', link: 'WebRTC /api/webrtc', license: 'MIT', url: 'https://github.com/AlexxIT/go2rtc', health: 'go2rtc' },
  { id: 'mediamtx', name: 'MediaMTX', where: 'edge', role: 'Receives DJI RTMP live streams and re-serves them as WebRTC (WHEP) and HLS.', link: 'WHEP · HLS', license: 'MIT', url: 'https://github.com/bluenviron/mediamtx', health: 'mediamtx' },
  { id: 'mosquitto', name: 'Eclipse Mosquitto', where: 'edge', role: 'The MQTT broker everything publishes to, with a WebSocket listener for this page.', link: 'MQTT over WSS', license: 'EPL-2.0 / EDL-1.0', url: 'https://github.com/eclipse/mosquitto', health: 'mqtt' },
  { id: 'nanoowl', name: 'NVIDIA NanoOWL', where: 'edge', role: 'Open-vocabulary detection on TensorRT: find "open gate" or "coyote" by text.', link: 'ranch-edge /v1/owl', license: 'Apache-2.0', url: 'https://github.com/NVIDIA-AI-IOT/nanoowl', health: 'nanoowl', nvidia: true },
  { id: 'nanosam', name: 'NVIDIA NanoSAM', where: 'edge', role: 'Real-time segment-anything on TensorRT: tap to cut out a fence break or a hay bale.', link: 'ranch-edge /v1/sam', license: 'Apache-2.0', url: 'https://github.com/NVIDIA-AI-IOT/nanosam', health: 'nanosam', nvidia: true },
  { id: 'jetson-containers', name: 'jetson-containers', where: 'edge', role: 'Builds and runs NanoOWL and NanoSAM for the Jetson\'s exact JetPack version.', link: 'install script', license: 'MIT', url: 'https://github.com/dusty-nv/jetson-containers', nvidia: true },
  { id: 'megadetector', name: 'MegaDetector V6 (Pytorch-Wildlife)', where: 'edge', role: 'Animal / person / vehicle detection built for camera traps and night IR.', link: 'ranch-edge enrichment', license: 'MIT', url: 'https://github.com/microsoft/CameraTraps', health: 'megadetector' },
  { id: 'rf-detr', name: 'RF-DETR', where: 'edge', role: 'Transformer detector to fine-tune on your own cattle, horses, gates and vehicles.', link: 'ranch-edge enrichment', license: 'Apache-2.0', url: 'https://github.com/roboflow/rf-detr', health: 'rfdetr' },
  { id: 'cowcatcher', name: 'Cowcatcher / Calvingcatcher', where: 'edge', role: 'YOLO models for cattle and calving stages, run on snapshots from the barn cameras.', link: 'ranch-edge enrichment', license: 'see model card · runs on Ultralytics (AGPL-3.0)', url: 'https://huggingface.co/CowcatcherAI/Cowcatcher', health: 'cowcatcher' },
  { id: 'grounding-dino', name: 'Grounding DINO', where: 'edge', role: 'Heavier open-vocabulary detector for offline searches through recorded footage.', link: 'ranch-edge /v1/owl?model=gdino (optional)', license: 'Apache-2.0', url: 'https://github.com/IDEA-Research/GroundingDINO', health: 'groundingdino' },
  { id: 'mavlink2rest', name: 'mavlink2rest', where: 'edge', role: 'Bridges ArduPilot / PX4 telemetry to a WebSocket this page reads.', link: 'WSS /v1/ws/mavlink', license: 'MIT', url: 'https://github.com/bluerobotics/mavlink2rest', health: 'mavlink' },
  { id: 'ardupilot', name: 'ArduPilot', where: 'aircraft', role: 'Autopilot on the drones and rovers. Telemetry read here; missions are drafted for a pilot to upload.', link: 'MAVLink', license: 'GPL-3.0', url: 'https://github.com/ArduPilot/ardupilot' },
  { id: 'opendronemap', name: 'OpenDroneMap', where: 'edge', role: 'Builds the orthophoto and elevation model the 3D map is draped with.', link: 'orthophoto URL', license: 'AGPL-3.0', url: 'https://github.com/OpenDroneMap/ODM' },
  { id: 'meshtastic', name: 'Meshtastic', where: 'radio', role: 'LoRa mesh for positions, sensor readings and texts where there is no cell signal.', link: 'MQTT msh/…/json', license: 'GPL-3.0', url: 'https://github.com/meshtastic/firmware' },
  { id: 'sparrow', name: 'Microsoft SPARROW', where: 'reference', role: 'Solar acoustic + camera field stations. The data path is ready (ranch/sensors/#); SPARROW itself is not bundled.', link: 'MQTT ranch/sensors/#', license: 'check repository', url: null, why: 'Repository not verified from this build environment.' },
  { id: 'opennvr', name: 'OpenNVR', where: 'reference', role: 'Alternative AI NVR. Frigate fills this role here; swap it in if you prefer.', link: '—', license: 'AGPL core (per the research)', url: null, why: 'Overlaps Frigate, which fills this role here.' },
  { id: 'sentry-vision-edge', name: 'Sentry Vision Edge', where: 'reference', role: 'Experimental Jetson thermal perimeter project.', link: '—', license: 'check repository', url: null, why: 'Very limited adoption; test independently before relying on it.' },
  { id: 'deepcamera', name: 'DeepCamera', where: 'reference', role: 'Self-hosted multi-camera stack with face recognition.', link: '—', license: 'check repository', url: 'https://github.com/SharpAI/DeepCamera', why: 'Face recognition is left out deliberately: it carries legal duties in many states and is not needed to protect a ranch.' },
];

/** Labels for `where`. */
export const WHERE = {
  device: 'Running on this device',
  edge: 'Edge box',
  aircraft: 'On the aircraft',
  radio: 'On the radios',
  reference: 'Not wired in',
};

/**
 * Status of each component, from the edge service's `/v1/health` answer.
 *
 * @param {object|null} health `{ components: { key: { ok, detail } } }`, or null.
 * @returns {Map<string, { ok: boolean|null, detail: string }>} Status by stack id.
 */
export function statusOf(health) {
  const map = new Map();
  for (const item of STACK) {
    if (item.where === 'device') { map.set(item.id, { ok: true, detail: 'bundled' }); continue; }
    if (item.where === 'reference') { map.set(item.id, { ok: null, detail: item.why }); continue; }
    if (!item.health) { map.set(item.id, { ok: null, detail: item.link }); continue; }
    const c = health?.components?.[item.health];
    map.set(item.id, c ? { ok: Boolean(c.ok), detail: c.detail || (c.ok ? 'up' : 'down') } : { ok: null, detail: health ? 'not reported' : 'edge box not connected' });
  }
  return map;
}
