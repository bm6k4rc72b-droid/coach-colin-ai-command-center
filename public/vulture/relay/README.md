# VultureSystemV1 RTSP relay

Browsers can't open `rtsp://` streams. This relay runs on a machine on your own network. ffmpeg pulls each camera's stream, and the relay serves it to the VultureSystemV1 web app as MJPEG over HTTP. Inference still happens in the browser, and no video goes to the internet.

## Run it

```bash
# needs Node 18+ and ffmpeg (brew install ffmpeg / apt install ffmpeg / winget install ffmpeg)
node rtsp-relay.mjs                         # http://127.0.0.1:8787 (this machine only)
HOST=0.0.0.0 node rtsp-relay.mjs            # reachable from your phone/tablet on the LAN
HOST=0.0.0.0 TOKEN=change-me node rtsp-relay.mjs   # require ?token=change-me
```

In the app, go to **Cameras & Devices → IP / RTSP camera**, paste the camera URL and set the relay address. If you set a token, add `?token=…` to the relay address.

## Typical camera URLs

| Camera | URL pattern |
|---|---|
| Hikvision | `rtsp://user:pass@IP:554/Streaming/Channels/101` |
| Dahua / Amcrest | `rtsp://user:pass@IP:554/cam/realmonitor?channel=1&subtype=0` |
| Reolink | `rtsp://user:pass@IP:554/h264Preview_01_main` |
| Axis | `rtsp://user:pass@IP/axis-media/media.amp` |
| UniFi Protect | enable RTSP per camera → `rtsps://IP:7441/<token>` |
| Tapo / TP-Link | `rtsp://user:pass@IP:554/stream1` |
| DJI drones (RC Pro / Enterprise, RTMP/RTSP live) | point the controller's live stream at an RTSP/RTMP server (MediaMTX), then use that URL |
| GoPro / DJI Action (webcam mode) | not needed: these appear as a normal webcam over USB |

## Notes

- The relay only accepts `rtsp(s)://`, `rtmp://`, `srt://`, `udp://` and `http(s)://` sources. ffmpeg is started without a shell, so a URL can't inject commands.
- **HTTPS pages and a local relay.** The hosted app is served over HTTPS. Chrome allows requests to `http://127.0.0.1` from it. Firefox and Safari may block a plain-HTTP LAN address (mixed content). If that happens, run the app locally (`npx serve public/vulture`) or put the relay behind HTTPS (Caddy, Tailscale Funnel).
- Each viewer starts its own ffmpeg process. `MAX_STREAMS` (default 8) caps the number of processes.
