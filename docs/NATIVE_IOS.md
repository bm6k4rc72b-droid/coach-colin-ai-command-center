# Porting to a native iOS app

The web app runs on any phone and iterates in seconds, which is why it is the
starting point. Going native buys three things a browser cannot give you.

## What native actually buys

**Frame rate and slow motion.** `AVCaptureDevice` will give you 240fps at 720p
on recent iPhones. Pressure onset and time-to-throw are only as precise as the
frame interval: at 30fps your timing error is ±33ms, at 240fps it is ±4ms. For a
metric like pressure response, where the whole signal is a few tenths of a
second, that is the difference between a number a coach can act on and noise.

**Sustained throughput.** Vision and Core ML run on the Neural Engine. WebGL via
TensorFlow.js runs on the GPU with a JavaScript round-trip per frame, and iOS
Safari throttles it hard once the phone warms up — which it will, outdoors, in
sun, recording video.

**Capture that survives.** Background writes, ProRes, and no risk of Safari
evicting the tab mid-practice.

## Architecture

```
AVCaptureSession (240fps, .builtInWideAngleCamera)
   -> AVCaptureVideoDataOutput  (CMSampleBuffer per frame)
      -> VNDetectHumanBodyPoseRequest      (Vision, on-device, free)
         or a YOLO/RTMPose Core ML model   (better in crowds, ~10MB)
      -> tracker (VNTrackObjectRequest, or port the bounding-box tracker)
      -> PlayEngine  <- ported unchanged from src/metrics/playEngine.ts
      -> Metal/SwiftUI overlay
```

## What ports directly

`src/metrics/playEngine.ts`, `src/metrics/models.ts` and
`src/vision/homography.ts` are pure functions over numbers, with no DOM and no
TensorFlow. They translate to Swift almost line for line, and the verification
scripts in `scripts/` define the expected outputs — port those first and you
have a Swift test suite before you have a Swift app.

`src/vision/players.ts` was deliberately split out from the detector for exactly
this reason: it is the geometry, with no runtime attached.

## What has to be rewritten

- **Detection.** `VNDetectHumanBodyPoseRequest` is one person at a time; for 22
  players run `VNDetectHumanRectanglesRequest` first and a pose request per box,
  or ship a multi-person Core ML model. This is the main engineering cost.
- **Team classification.** Same clustering idea, but sample pixels via
  `CVPixelBuffer` rather than a canvas.
- **UI.** SwiftUI, with the overlay in a `CAMetalLayer` or a `Canvas` view.

## Sequencing advice

Do not start here. Run the web app at a real practice first and find out where
the tracking actually breaks — crowded pockets, sun angle, white-on-white
jerseys. Those findings change which detection model is worth shipping natively,
and that decision is expensive to reverse once you have built around it.
