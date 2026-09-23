# UcantSeeMeX — by Coach Colin

Privacy command center. Real-time pinch-to-vanish invisibility on your own camera feed, with Coach Colin as the voice receptionist.

## Run

Camera APIs require a secure context (localhost or HTTPS).

```bash
cd ucantseeme-x
python3 -m http.server 8765
```

Open http://localhost:8765

## Use the cloak

1. Click **Enter Batcave** and allow the camera.
2. Step out of frame (or point the camera at an empty wall).
3. Click **Calibrate background**.
4. Step back in. Pinch thumb to index finger — you disappear from the live canvas.
5. Pinch again to return. Toggle Thermal NV for the false-color overlay.

Coach Colin’s voice lines play on enter, calibrate, stealth, thermal, and help.

## What is real vs simulated

| Layer | In this web app | Production |
|---|---|---|
| Person mask | MediaPipe Selfie Segmentation (on-device WASM) | Same, or Apple Vision / MediaPipe Tasks native |
| Pinch | MediaPipe Hands landmarks 4–8 | Same |
| Invisibility | Canvas composite vs stored background | Same algorithm |
| Thermal | Inferno colormap on RGB | FLIR Lepton / Seek LWIR + fusion |
| Motion | DeviceMotion IMU | IMU + PIR + optical flow |
| Wi-Fi CSI | Visualized waveform | ESP32 CSI / Nexmon / Intel 5300 |
| Voice | Atlas neural TTS as Coach Colin | Same clips or on-device TTS |

See `docs/TECH.md` and the in-app **Software stack & cited studies** section.

## License / intent

Privacy-creator concept. Own your visibility. Not a tool for evading lawful surveillance.
