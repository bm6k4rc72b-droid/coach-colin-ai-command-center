# TheJudgeV1

Real-time fight scoring + camera trainer PWA.

## Run
Open `index.html` over https or localhost so camera and mic work.

```
cd thejudgev1
python3 -m http.server 8080
```

iPhone Safari, Android Chrome, laptop browser. Use WATCH / GLASSES chrome in the top bar.

## Trainer
**TRAIN · UPPERCUT · AR**
- Front / rear / arm camera, 2-cam PIP when a second lens exists
- Modes: clean, night, thermal, heat, exo, ego, AR
- MediaPipe pose (online) or motion fallback
- Muscle load, biomech, GRF, EMG, OpenSim-lite, ROM, trace
- Floating pads (jab / cross / upper). Misses drop health. TKO results.

Dana commands: start fight, open camera, train, scorecard, sync devices.
