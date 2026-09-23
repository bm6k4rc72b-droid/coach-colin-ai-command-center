# SupermanX — Fitness AI prototype

Interactive web prototype of the SupermanX concept from your reference frames.

## How to open (working local app)

1. Unzip `SupermanX-app.zip` if you received the archive.
2. Keep this folder structure intact (`index.html` next to `audio/`).
3. Open `index.html` in Chrome or Edge (camera + MediaPipe need a modern Chromium browser).
4. Click **Hear Rex** — high-energy British male receptionist (Atlas / en-GB).
5. Click **Start Live Camera** for on-device 33-point pose, or **Simulate Set** / **Engage Invisible Mode**.

If the browser blocks `file://` camera or ES modules, serve the folder:

```bash
cd SupermanX
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765

## What works in this build

- Rex voice lines (welcome, live start, form cue, invisible mode, strength prescription, set complete)
- Exercise + goal selection (strength / hypertrophy / endurance)
- Live camera + MediaPipe Pose Landmarker (33 keypoints) when the model CDN is reachable
- Simulated / invisible CSI session with velocity, power, velocity-loss, waveform
- Post-set prescription grounded in VBT literature
- Full tech + cited-studies page inside the app

## What is concept / production-only

Drones, smart glasses, FLIR thermal, and commodity-phone Wi-Fi CSI extraction are specified on the Tech page. Phones do not expose CSI to third-party apps; invisible mode in production needs a paired CSI access point or research NIC.

This is a working coaching UI + sensor architecture demo, not a medical device or force-plate lab.
