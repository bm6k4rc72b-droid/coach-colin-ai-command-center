# VultureSystemV1

Browser app by Coach Colin. Occupancy loop follows Lot Vulture (lotvulture/lotvulture): connect a camera, draw polygon stalls, run on-device vehicle inference, hold state with dual-threshold hysteresis, stream the map.

This build does not ship Lot Vulture's C++ ONNX weights (those sit under the Lot Vulture Source License and are not redistributable as a competing package). The same pipeline runs here in the browser:

- Demo lot feed drives the real occupancy engine immediately
- Webcam, video file, photo, or CORS snapshot URL run COCO-SSD on device
- Space designer saves 4-point stalls in localStorage
- Alerts and a utilization timeline record state changes
- Kinetics view runs MediaPipe Pose for joint angles and estimated muscle load
- Terrain view scores route risk from slope, surface, and time of day

Open `index.html` from a local server so the camera and models are allowed:

```
python3 -m http.server 8080
```

Then visit http://localhost:8080
