# RANCH COMMAND — edge box

The dashboard at `public/ranch-command/` runs on any phone or laptop. This
directory is everything that runs **on the ranch**: the box that records the
cameras, runs the heavy models, and gives the dashboard something to connect
to.

```
 IP / thermal cameras ──RTSP──▶ Frigate (+ go2rtc) ──MQTT──▶ Mosquitto ◀──WSS── dashboard
 DJI (Fly / Pilot 2) ──RTMP──▶ MediaMTX ─────────── WHEP / HLS ─────────────▶ dashboard
 ArduPilot / PX4 ──MAVLink UDP──▶ mavlink2rest ───── WSS JSON ──────────────▶ dashboard
 Meshtastic + sensors ──────────MQTT──▶ Mosquitto
 Frigate events ──▶ ranch-edge (MegaDetector · RF-DETR · Cowcatcher) ──▶ ranch/events
 dashboard ──HTTPS /v1──▶ ranch-edge (NanoOWL · NanoSAM on TensorRT)
```

## Hardware

- **NVIDIA Jetson Orin Nano (8 GB) or better**, JetPack 6. Orin NX / AGX if
  you run more than ~6 cameras with the enrichment models on.
- Or an **x86 PC with an NVIDIA GPU** and the NVIDIA Container Toolkit.
- An SSD for recordings (Frigate writes continuously).

## Install

```bash
git clone https://github.com/bm6k4rc72b-droid/coach-colin-ai-command-center
cd coach-colin-ai-command-center/edge/ranch-command
./install.sh
```

`install.sh` generates passwords into `.env`, creates three MQTT users
(`frigate`, `ranch-edge`, `dashboard`), starts the services, builds the
NanoOWL TensorRT engine on a Jetson, and prints the HTTPS commands for the
next step. Run it again any time; it keeps existing passwords and data.

## HTTPS for the dashboard

The dashboard is served over HTTPS, so browsers will only let it talk to
HTTPS/WSS addresses. The simplest private way is **Tailscale**: install it on
the edge box and on your iPhone, then:

```bash
tailscale serve --bg --https=443   http://127.0.0.1:8787   # ranch-edge API
tailscale serve --bg --https=8443  http://127.0.0.1:9001   # MQTT over WebSocket
tailscale serve --bg --https=10000 http://127.0.0.1:1984   # go2rtc (camera WebRTC)
tailscale serve status
```

Nothing is exposed to the internet; only devices on your tailnet can reach
it. MediaMTX (DJI video) and mavlink2rest (drone telemetry) need a port each
too: Tailscale Serve on a tailnet accepts other HTTPS ports, or put them
behind path mounts — check `tailscale serve --help` for your version, as the
flags have changed between releases.

## Connecting things

**IP and thermal cameras** — add each to `config/frigate.yml` under
`go2rtc.streams` and `cameras`. Name zones with the words the alert rules
read: `gate`, `perimeter`, `road`, `barn`, `shop`, `fuel`, `pen`, `pasture`,
`corral`, `fence` (for example `north_gate`, `calving_pen`). Then on the
dashboard's Cameras slide add a **WebRTC** camera:
`https://<edge>.ts.net:10000/api/webrtc?src=north_gate`.

**DJI drones** — in DJI Fly or DJI Pilot 2, start *Live Streaming → RTMP* to
`rtmp://<edge-box-ip>:1935/dji`. Add `…/dji/whep` (WebRTC) or
`…/dji/index.m3u8` (HLS, native on iPhone) as a camera. Alternatively, plug
the remote's HDMI out into a USB capture card on a laptop and add it as a
*device* camera — no server needed.

**ArduPilot / PX4 drones and rovers** — forward MAVLink to the edge box on
UDP 14550 (QGroundControl: *Application Settings → MAVLink → forwarding*, or
`mavproxy.py --out udp:<edge>:14550`). The dashboard reads it from
`wss://…/v1/ws/mavlink`. Telemetry is read-only; missions are drafted as
QGroundControl `.plan` files for a pilot to review and upload.

**Meshtastic** — on each gateway node enable the MQTT module, point it at the
edge box with the `dashboard` user or a dedicated one, and turn on **JSON
output**. The dashboard subscribes to `msh/#`.

**Field sensors** (water tanks, gate switches, SPARROW-style stations) —
publish a number or a JSON object to `ranch/sensors/<node>/<metric>`.

## The models

| Model | Runs | Turned on by |
|---|---|---|
| NanoOWL | ranch-edge `/v1/owl` | built by `install.sh` on a Jetson |
| NanoSAM | ranch-edge `/v1/sam` | two engines in `data/models` (see install output) |
| MegaDetector V6 | enrichment of every Frigate animal/person/vehicle | `PytorchWildlife` installed |
| RF-DETR | enrichment | `RFDETR_WEIGHTS` — a checkpoint fine-tuned on your ranch |
| Cowcatcher / Calvingcatcher | enrichment on calving cameras | `COWCATCHER_WEIGHTS` + `CALVING_CAMERAS` |

Every model is optional. One that is missing shows as down in `/v1/health`
and on the dashboard's Stack slide, and its endpoint answers 503 — the
dashboard then falls back to running OWL-ViT or SlimSAM in the browser.

## What has and has not been verified

Verified in this repository's tests: the routing rules (shared fixtures, run
in both the browser and Python), the API's behaviour with no models
installed (honest 503s, honest health, CORS), and the enrichment logic's
label selection.

**Not verified here**, because the build environment has no Jetson, no GPU,
no cameras and no Docker: the compose stack starting, the NanoOWL / NanoSAM
/ MegaDetector / RF-DETR / Cowcatcher calls against real weights (each is
written to its project's documented API and isolated in
`ranch_edge/models.py` so a fix is one function), Tailscale Serve flags, and
the mavlink2rest JSON format against a real vehicle. Expect to adjust one or
two of these on first install.

## Licences — read before selling this as a service

| | Licence | Note |
|---|---|---|
| Frigate, go2rtc, MediaMTX, mavlink2rest, jetson-containers | MIT | permissive |
| NanoOWL, NanoSAM, RF-DETR, Grounding DINO, MediaPipe | Apache-2.0 | permissive |
| MegaDetector / Pytorch-Wildlife | MIT | permissive |
| Mosquitto | EPL-2.0 / EDL-1.0 | permissive for use |
| ArduPilot, Meshtastic | GPL-3.0 | firmware on the hardware; fine to talk to |
| OpenDroneMap | AGPL-3.0 | a hosted mapping service triggers source obligations |
| Ultralytics (under Cowcatcher) | AGPL-3.0 | needs a commercial licence, or source release, for a paid hosted service |

This is a summary, not legal advice.

## NVIDIA branding

The dashboard says "Edge AI built for NVIDIA® Jetson™" in plain text, which
is a factual description. It deliberately does **not** reproduce NVIDIA's
logo or the "Powered by NVIDIA" badge: those are licensed to partners
(through the NVIDIA Partner Network / Inception programme). Once approved,
drop the official asset into the marked badge slot in `js/app.js`
(`ctx.poweredBy`).
