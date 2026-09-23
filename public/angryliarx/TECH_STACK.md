# AngryLiarX — software, hardware, and cited science

Best-available stack for the features in the reference frames. Lab numbers are not product guarantees.

## 1. Face / anger / micro-expression

**Production software**
- Face mesh + AUs: Google MediaPipe Face Landmarker (on-device, mobile + glasses companion)
- Emotion head: MobileNetV2 / EfficientNet-lite TFLite or Core ML (the lightweight CNN shown in the marketing notes)
- Commercial AU reference: Affectiva AFFDEX 2.0 (20 action units, EMFACS emotion mapping)
- Open fallback: OpenFace 2.0 AU presence/intensity
- Tracking robustness: Kalman / One-Euro filter on landmarks so glasses HUD does not jitter

**Studies**
- Affdex vs facial EMG on posed happy / angry / neutral — software and EMG agree well on posed expressions (Stöckli et al.; later Affdex vs EMG mimicry work).
- AFFDEX 2.0 technical report (arXiv 2202.12059): 7 basic emotions from AU combinations; in-the-wild toolkit.
- MobileNetV2 on FER-2013: ~73.8% 7-class, high AUC, built for phones (Bishwas et al. 2025).
- Classic 6-emotion CNNs trained on 30k+ stills overstate performance vs live conversation.

AngryLiarX should treat AU + emotion as **signals**, not verdicts.

## 2. Thermal night vision + stress

**Production software / hardware**
- Sensor: FLIR Boson / Lepton or equivalent 160×120–640×512 LWIR on glasses boom and drone gimbal
- Pipeline: NUC → face detect in IR → periorbital + forehead + nasal ROI → time derivative of temperature / blood-perfusion proxy
- Fusion: thermal ROI + rPPG from RGB (Liu et al. 2024, rPPG + thermal mental-state work)
- Overlay: anamorphic / HUD false-colour palette only after radiometric calibration

**Studies the pitch deck already points at**
- Pavlidis, Eberhardt & Levine, *Nature* 2002: periorbital thermal mock-crime, 83% vs 70% polygraph, n=20. Temperature shift tied to sympathetic flow in ~300 ms.
- Tsiamyrtzis et al., IJCV 2007: automated periorbital tracker, 87.2% after filtering (raw signal near chance).
- Shastri / Pavlidis IEEE EMBS 2008: fuzzy periorbital segmentation, ~82%.
- Gołaszewski, Zając & Widacki, *European Polygraph* 2015 review: periorbital and nasal regions most informative; pairing with polygraph stronger than thermal alone.
- *J. Image Video Processing* 2024: lab interrogation thermal video, forehead + periorbital SVM combination up to ~92.9% on that set; thermal-only lower.
- Marketing line “92% combined vs 88% polygraph vs 70% thermal” is in the *direction* of those combo papers — quote the paper, sample size, and mock-crime setting every time.

Limits: small n, mock crime, cooperation, no robust countermeasure literature comparable to polygraph.

## 3. Invisible motion sensor (Wi-Fi CSI) — “no camera”

This is the feature that goes invisible.

**Production software / hardware**
- Nodes: ESP32-S3 (Espressif CSI) or Wi-Fi 6E NIC with CSI (research stacks on Intel / Nexmon)
- Capture: per-subcarrier amplitude + phase at 20–100 Hz
- Motion layer: sliding-window std of selected subcarriers vs quiet-room baseline + hysteresis
- Respiration layer: detrend → band-pass 0.15–0.5 Hz → FFT / EMD; optional MVDR steering (Wi-locind)
- Activity net: Wi-SensiNet-class attention model or EfficientNetV2 on CSI spectrograms
- Privacy: no pixels; still radio surveillance — consent and premises control required

**Studies**
- IEEE WCNC 2024 Wi-locind: location-robust CSI respiration, MAE < 0.3 breaths/min with arrays.
- IEEE ICBASE 2024 Wi-SensiNet: through-wall HAR, very high accuracy on a 7-activity collected set.
- IEEE ICIP 2024: ESP32-S3 directional through-wall HAR across rooms, ~87–92% NLOS on Wallhack 1.8k.
- GLOBECOM 2024: commodity Wi-Fi 6E respiration after CSI defect correction.
- ICDACAI 2024: CSI respiratory waveform extraction.
- Complementary amplitude + phase for respiration is standard in this literature; 1–5 mm chest wall motion is the physical mechanism.

Browser demo **simulates** the aggregator. Real ghost mode is firmware on the radio.

## 4. Voice

**Use**
- openSMILE (eGeMAPS / ComParE) + learned embeddings (wav2vec 2.0 / Whisper encoder) for arousal, rate, pause, jitter, shimmer
- Speech-to-text only as context, not as a lie oracle

**Do not use**
- CVSA / LVA / consumer “voice lie detectors”

**Studies**
- National Research Council 2003: little or no scientific basis for computer voice stress as deception detection.
- DoJ / DoD instrument evaluations: chance-level deception calls, high false positives.
- openSMILE remains excellent for **affect and spoof/acoustic features**, not guilt.

Rex is a receptionist, not a polygraph.

## 5. Fusion, sync, glasses, drone

- Fusion: late fusion with calibrated probabilities + abstain band. Display “stress / affect / motion” first; “deception risk” only as a model score with CI.
- Transport: WebRTC (glasses/phone HUD), MQTT (CSI nodes, drone telemetry), TLS 1.3, libsodium E2E at rest.
- Glasses: WebXR or vendor SDK (XREAL / Meta / Snap). HUD labels from fusion service.
- Drone: DJI Mobile SDK + thermal payload; geofence and local aviation law.
- Mobile: Swift + Core ML / Kotlin + TFLite; same models as laptop ONNX Runtime.

## Honest product sentence

AngryLiarX is a **multimodal arousal, affect, and occupancy cockpit** for coaching and authorised security. It is not a portable court of law. Through-wall CSI and covert thermal on third parties can be illegal. Ship consent, retention limits, and an uncertainty UI or do not ship.
