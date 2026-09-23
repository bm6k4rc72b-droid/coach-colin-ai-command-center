# UcantSeeMeX — full software & research map

## Architecture

```
Webcam
  ├─ MediaPipe Selfie Segmentation  → person mask
  ├─ MediaPipe Hands                → pinch / open-palm gestures
  └─ Canvas compositor
        ├─ stored background plate (calibrate)
        ├─ destination-out punch with mask
        └─ optional thermal colormap / night boost

IMU (DeviceMotion) ──────────────► motion radar
RF visualization (simulated) ────► Wi-Fi wave panel
Atlas TTS (Coach Colin) ─────────► receptionist
```

All vision inference in this demo is on-device via MediaPipe WASM. No video is uploaded.

## 1. Core invisibility engine

**Best software for the browser demo:** Google MediaPipe Selfie Segmentation + MediaPipe Hands + Canvas 2D.

**Best software for native apps:**
- iOS: Vision `VNGeneratePersonSegmentationRequest` or MediaPipe Tasks iOS
- Android: MediaPipe Tasks Vision Image Segmenter + Gesture Recognizer, CameraX
- Desktop: MediaPipe Python / C++ or TensorFlow.js body-segmentation (`MediaPipeSelfieSegmentation`)
- Edge cameras: MediaPipe LiteRT / TFLite selfie_segmenter.tflite on NPU

**Algorithm (matches the cited GitHub ghost-invisibility family):**
1. Capture a clean background frame.
2. For each live frame, run selfie segmentation → float mask ∈ [0,1].
3. Output = live * (1 − mask) + background * mask when stealth is on.
4. Gesture gate: pinch toggles stealth.

**Model notes:** Both selfie-seg variants are MobileNetV3 derivatives. General = 256×256×3 in, 256×256 mask out. Landscape = 144×256, fewer FLOPs, used by Google Meet-class pipelines. Intended range &lt; 2 m.

**Citations / sources**
- MediaPipe Selfie Segmentation documentation and model card (Google AI Edge / google-ai-edge/mediapipe)
- TensorFlow Blog, “Body Segmentation with MediaPipe and TensorFlow.js” (2022)
- Zhang, F. et al., “MediaPipe Hands: On-device Real-time Hand Tracking” (2020)
- Open cloak repos referenced in the product notes:
  - rakeshkattimani25/ghost-invisibility
  - harshbhadani4597/ghost-invisibility-effect
  - haripriya262007-blip/invisibility-mode
  - khyathi-2006/invisibility-computer-vision
  - tubakhxn/Invisibility-Computer-Vision

## 2. Thermal + night vision

**Best software / hardware**
- Sensor: FLIR Lepton 3.5 + PureThermal adapter, or Seek Thermal Compact
- Drivers: libuvc / vendor SDK; GStreamer `v4l2src` on Linux
- Fusion: align RGB and IR, run selfie-seg on RGB, gate with IR ΔT blobs
- Classical IR path: background heat plate − live IR → threshold → morphology → human-shaped components

The web thermal mode is a luminance→inferno colormap so the HUD matches the product art. It is labeled as a simulation in the voice line.

**Why fusion:** cloth texture and background similarity break RGB-only masks; IR contrast collapses when a person is near ambient temperature. Combined RGB+IR is the robust single-human segmenter.

## 3. Motion

**Best software**
- Web / phone: `DeviceMotionEvent` + `LinearAcceleration`
- Wearables: vendor IMU fusion (Core Motion, Android SensorManager TYPE_LINEAR_ACCELERATION)
- Cameras: Farneback or DIS optical flow as a second vote
- Rooms: Panasonic / Panasonic-class PIR + mmWave (60 GHz) if CSI is unavailable

This app treats |‖a‖ − 9.8| as a spike and feeds the radar widget.

## 4. Wi-Fi CSI presence

**Best software for a real product (not available inside Chrome):**
- ESP32: Espressif `esp-csi` / CSI toolkit
- Raspberry Pi / Broadcom: Nexmon CSI extractor
- Lab NIC: Intel 5300 CSI Tool
- DSP: Hampel identifier + Savitzky–Golay smoothing
- Classify: 1D CNN / ResNet on CSI spectrograms, or SVM / LSTM on wavelet features

**Cited performance**
- IEEE device-free CSI presence + counting: 98.75% presence, 97.78% crowd 0–5, 95.60% on an external set after Hampel + Savitzky–Golay + CNN/ResNet
- “A Non Intrusive Human Presence Detection Methodology Based on Channel State Information of Wi-Fi Networks,” Sensors 2023 (MDPI): &gt;90% average
- Amazon-sponsored UW work: home presence detection and localization using commodity CSI, target &gt;90% TPR
- Damodaran, Schäfer, Köksal, “Device free human activity and fall recognition using WiFi CSI,” CCF Transactions on Pervasive Computing and Interaction, 2020 (SVM + LSTM)

RSSI-only “upward spikes” are a coarse fallback mentioned in the product notes. CSI across OFDM subcarriers is the actual feature family.

## 5. Voice receptionist

Coach Colin is the Atlas multilingual neural voice. Scripts live in `/audio`. Production apps can keep the clips or run on-device TTS with the same persona.

## 6. Multi-device fabric

| Client | Recommended stack |
|---|---|
| iPhone | SwiftUI + AVFoundation + Vision person segmentation |
| Android | Kotlin + CameraX + MediaPipe Tasks |
| Laptop | This PWA / Electron + WebRTC |
| Smart glasses | WebXR HUD or vendor AR OS; same mask pipeline at lower res |
| Drone | RTSP + LWIR gimbal; ground station runs the dashboard |
| IoT camera | TFLite segmenter on-device; events over MQTT/TLS |

Sync rule from the art: encrypted end-to-end, live sync, no raw frames off-box unless the owner publishes a processed feed.

## 7. Ethics boundary

The product copy is explicit: privacy creator, own your visibility, not surveillance evasion. The cloak edits the owner’s composite. It does not disable third-party cameras, radios, or human observers.
