# Guardian

Low-light perimeter detection on a spare phone. Detection runs entirely
on-device; there is no server, and no video or image ever leaves the handset.

This is `apps/guardian` — the first product of the Aperture programme. The
shared `vision-core` and `hud-kit` packages described in the architecture doc
live inside `src/core` and `src/theme` for now; they get extracted into real
packages when the second app needs them, not before.

---

## What works today, and what doesn't

**Written and tested:** the tracker, the suppression engine, and all the
geometry they stand on. 34 unit tests, runnable right now with no mobile
toolchain:

```bash
npm test
```

Those tests encode real false positives — a fox, a branch in wind, a wheelie
bin, rain on the lens, headlights, a neighbour walking past. If a change makes
one of them alert, the change is wrong however good it looks on a detection
benchmark.

**Written but never executed:** everything under `src/screens`, `src/vision`,
`src/components`, `src/store`, and both native plugins. They were authored
without a device, a camera, or a mobile toolchain in the loop. Expect to fix
things on first run — that is the normal state of code that has not met
hardware, not a defect in the plan.

**Not written:** the detection model itself. See "Wiring the native detector".

Without the native plugin the app still installs and runs — it shows the
camera, every screen works, and the detector reports nothing. That is
deliberate: you can test permissions, zones, notifications and the whole
product loop before the model exists.

---

## What you need

| | |
|---|---|
| **Node** | 20 or newer |
| **Expo account** | free — `npx expo login` |
| **Apple Developer Program** | $99/year, needed to install on an iPhone |
| **Google Play Console** | $25 once, only needed to publish |
| **A physical phone** | of each platform. Simulators have no usable camera |

You do **not** need a Mac. EAS builds iOS in the cloud.

---

## Getting it running

```bash
cd apps/guardian
npm install
npx expo login
npm install -g eas-cli && eas login
```

Vision Camera cannot run in Expo Go — it needs a development build. This is the
step that eats people's first day; budget for it.

```bash
# Android — produces an APK you sideload
eas build --profile development --platform android

# iOS — needs your Apple credentials; EAS walks you through it
eas build --profile development --platform ios
```

Install the resulting build on the phone, then:

```bash
npm start
```

Scan the QR code from the dev build (not the Expo Go app) and it connects.

### First run

1. Read the consent screen. It is the app's actual privacy posture, not
   boilerplate — if the wording is wrong, fix it before anyone else sees it.
2. Tap **Areas** and outline the part of the view you care about. This is the
   single highest-leverage control in the app: most false alerts in a real
   garden come from a pavement or a neighbour's path that is simply outside the
   area you meant.
3. Tap **Arm**.
4. Leave the phone on charge. A phone watching a garden all night on battery
   will be dead by 2am, and `expo-keep-awake` keeps the screen on, which is not
   free.

---

## Wiring the native detector

The JS side binds to a frame processor plugin named `guardianDetect`. Skeletons
for both platforms are in `native/` and need to be copied into the generated
native projects after `npx expo prebuild`.

### Getting a model

Start with a COCO-pretrained YOLOv11-n. It detects people perfectly well in
usable light, and it means you are testing the whole pipeline in week one
instead of week six. Fine-tuning on your own night footage is a later
improvement, not a prerequisite.

```bash
pip install ultralytics
yolo export model=yolo11n.pt format=coreml   nms=True imgsz=320   # → iOS
yolo export model=yolo11n.pt format=tflite   int8=True imgsz=320  # → Android
```

- iOS: add the `.mlpackage` to the Xcode project as `GuardianDetector`, and copy
  `native/ios/GuardianDetectPlugin.swift` into `ios/Guardian/`.
- Android: put the `.tflite` and a `labels.txt` in
  `android/app/src/main/assets/`, and copy
  `native/android/GuardianDetectPlugin.kt` into
  `android/app/src/main/java/com/coachcolin/guardian/`.

The Android plugin has one deliberate gap, marked `TODO(model)`: converting the
frame's YUV planes into the model's input tensor. That preprocessing has to
match exactly how the model was exported — letterbox versus stretch, RGB versus
BGR, normalised versus 0-255 — and guessing it produces a detector that runs at
full speed and finds nothing, which is a miserable bug to chase. Write it
against your actual export.

---

## How the detection pipeline fits together

```
camera frame
  → frame processor (worklet thread, duty-cycled to ~8fps)
      → native model  → boxes + mean luma
  → tracker      (JS thread, stateful)  → stable identities
  → suppressor   (JS thread, stateful)  → alert or a reason not to
  → event log    (SQLite, on device)
```

Inference is deliberately **not** run on every frame. A phone pointed at a
garden all night will thermally throttle if you run a detector at 30fps, and a
person crossing a garden is in view for seconds — 8fps loses nothing and
roughly quarters the heat. `inferenceFps` in `usePipeline` is the dial.

### Why the tracker matters more than it looks

Suppression is all temporal — dwell time, path straightness, distance
travelled. Every one of those rules needs a subject to keep the same identity
across frames. A tracker that drops identity when someone walks behind a hedge
resets every timer and defeats the whole suppression stack, which is why the
second matching pass against low-confidence detections is in there. It is not
an optimisation; it is load-bearing.

### Tuning

`DEFAULT_SUPPRESSION` in `src/core/types.ts` holds every threshold, each with a
comment explaining what it is defending against. Change one, run `npm test`,
and see which real-world scenario you just broke.

The **Filtered out** tab in the app is the tuning instrument. It logs every
decision with its reason code, so after a week of real nights you can see
whether you are drowning in `oscillating-motion` (a tree in shot — redraw the
zone) or `not-yet-confirmed` (the detector is losing people — lower
`scoreCeiling` or raise the inference rate).

---

## What will actually be hard

Not the code. Two things:

**Thermal behaviour.** Measure it early — ten minutes of armed operation on
your oldest test device, watching for throttling. If it throttles, drop
`inferenceFps` before doing anything cleverer.

**False positives.** Getting to "under one false alert per camera per week"
takes weeks of real overnight footage from real gardens, labelled and tuned
against. That work is the product, and it is the part a competitor cannot copy
from your App Store listing.

---

## Honest limitations

- **It cannot see in the dark.** Phone sensors have infrared-cut filters, so an
  IR lamp does nothing. Guardian needs some ambient light. True darkness needs
  an IR camera, which means the RTSP ingest path — designed for, not built.
- **It detects people, it does not recognise them.** Deliberately. Adding face
  recognition would move the app into a materially heavier regulatory regime
  (GDPR Art. 9, BIPA, CUBI) for very little product gain.
- **No background operation yet.** The app watches while it is open and awake.
  Real background camera access is heavily restricted on both platforms and
  needs a foreground service on Android plus a hard conversation with App
  Review on iOS.
