# SupermanX technology stack and evidence

## Voice receptionist

- Role: Rex — high-energy British male coach / front-of-house
- This build: neural TTS voice **Atlas**, language hint `en-GB`
- Fallback: Web Speech API
- Production: same copy through a low-latency neural TTS with SSML emphasis on cues (“cut the set”, “stack the knee”)

## Motion that can go invisible

“Invisible” here means **no stored video and no required RGB camera**.

1. **Wi-Fi Channel State Information (CSI)**  
   Commodity APs already measure how the body perturbs subcarriers. Deep nets map amplitude + sanitized phase → keypoints.
   - WiFlow: continuous CSI pose, PCK@20 = 97.00%, MPJPE = 0.008 m on authors’ 360k-sample set, 4.82M parameters (arXiv:2602.08661).
   - RePos (2026): factorized relative-pose + root localization; 10–21% MPJPE reduction under MM-Fi cross-environment protocol vs MetaFi++, HPE-Li, Person-in-WiFi-3D, DT-Pose.
   - Person-in-WiFi-3D (CVPR 2024) and DensePose From WiFi (arXiv:2301.00250): 17 COCO keypoints and dense UV from CSI.
   - Hardware: Intel 5300 / Nexmon / ESP32-CSI research toolchains, or a dedicated sensing AP shipped with the gym kit.
   - Constraint: iOS and stock Android do not give third-party CSI. Invisible mode is a **paired radio**, not a solo App Store permission.

2. **6-axis IMU**  
   Wrist, belt, or bar-mounted IMU at ~200 Hz. Madgwick/Mahony fusion for orientation; double integration with high-pass / ZUPT for bar speed. Fills CSI dropouts.

3. **Optional RGB when the user allows it**  
   MediaPipe Pose Landmarker / BlazePose GHUM — 33 landmarks, on-device, no video uploaded by default. BlazePose Heavy ≈ 97% PCK@0.2 on HIIT. Stereo fusion can cut 3D RMSE roughly in half vs monocular (Sensors 2024 exercise study).

4. **Optional thermal**  
   FLIR Lepton-class LWIR. Jiao et al., Sensors 2021: difference heatmaps + CNN classified biceps / triceps / deltoid at 92.3%. Bo et al. 2021: IRT vs sEMG during calf raises. Perpetuini et al. 2023: IRT features estimate EMG ARV r = 0.886. Treat as a **load / heat proxy**, not a core-temperature medical reading.

## Biomechanics engine

Matches the kettlebell educational model in your first reference:

- Radial hand/arm force ≈ gravity component + centripetal (`m v² / r`) + shoulder acceleration term  
- Tangential velocity from pose or IMU  
- Equal-share-per-hand for two-hand swings  
- Power ≈ force · velocity (teaching estimate)

Offline audit path: OpenSim. Live path: lightweight inverse dynamics on phone.

## Decision layer (what Rex actually prescribes)

Velocity-based training, not just pretty overlays.

| Goal | Velocity-loss cut | Why |
|---|---|---|
| Strength / power | ~20–25% VL (sometimes 10–20% for peaking) | Pareja-Blanco 2017: VL20 ≈ VL40 for squat 1RM, better CMJ, 40% fewer reps, preserves MHC-IIX. Later reviews: low–moderate VL better for jump/sprint/velocity. |
| Hypertrophy | ~25–40% VL | VL40 more vastus hypertrophy in 2017 biopsy/MRI work; more volume and metabolic stress. |
| Endurance / skill | ROM + symmetry first | Angle targets from pose (e.g. pull-up elbow literature ~93° ± 15° mean flexion ROM in some samples). |

Wang et al., BMC Sports Sci Med Rehabil 2026 meta-analysis (17 studies, n = 348): VBT vs percentage-based training — jump SMD = 0.27 (p < 0.05), change-of-direction SMD = 0.45 (p < 0.01); maximal strength SMD = 0.21 (p = 0.064) and sprint SMD = 0.14 (n.s.). Same paper as the Springer screenshot in your references.

## Product topology (from the ecosystem frames)

- Phone (iOS / Android) — capture + Rex  
- Laptop dashboard — session review  
- Optional HUD glasses — pose glanceable  
- Optional drone cam — only if the user wants an external view; not required  
- Cloud sync of **metrics**, not raw video, by default

## What this prototype is not

Not a cleared medical device. Not force-plate accurate. CSI numbers in Simulate / Invisible are a teaching animation until a sensing AP is paired.
