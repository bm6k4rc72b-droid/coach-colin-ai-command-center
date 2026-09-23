# AngryLiarX — Control Center Prototype

Interactive product prototype for Coach Colin’s AngryLiarX platform:
real-time multimodal emotion / stress / motion analytics with a British male receptionist (Rex).

## Run it

```bash
cd angryliarx
python3 serve.py
```

Then open **http://127.0.0.1:8765**

Or just open `index.html` in a browser. Camera demo needs a local server (or granted file permissions).

Rex voice files live in `audio/` (high-energy male, `en-GB` synthesis). If autoplay is blocked, tap **Welcome**.

## What this build is

A high-fidelity **control-center demo** matching the marketing frames:
thermal HUD, deception analytics, glasses + drone, Wi-Fi CSI “ghost / invisible” sensor, multi-device sync, live session log.

It does **not** ship a real thermal camera, ESP32 CSI radio, or scientifically valid lie detector. Those need hardware and still cannot honestly be sold as courtroom truth machines. The Science tab states the actual papers and the limits.

## Voice receptionist

- Name: **Rex**
- Style: high-energy British tactical receptionist
- Lines: welcome, session live, anger alert, ghost mode, glasses/drone, whisper
- Fallback: browser `SpeechSynthesis` `en-GB` if MP3 autoplay is blocked
