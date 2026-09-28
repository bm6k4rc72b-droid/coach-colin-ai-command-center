# TheJudgeV1

Real-time fight scoring PWA from the product boards.

## Run it
Open `index.html` in Safari (iPhone), Chrome (Android), or any laptop browser.
For camera + mic you need https or localhost.

```
cd thejudgev1
python3 -m http.server 8080
```

Then visit http://localhost:8080

## What works in this build
- Live 10-point-must scoring, strike pad, simulated opponent
- iPhone / Android / laptop camera with motion-based strike detection and pose HUD
- Watch chrome and glasses HUD modes
- Device sync toggles
- Editable official scorecard + Fight IQ lens + JSON export
- AI pipeline and tech stack views
- Background boxing loop
- Mike Tyson combination that advances as you scroll
- Dana White male-voice receptionist (pre-rendered + live speech recognition)

Native App Store / Play / watchOS / VisionOS shells would wrap these same surfaces with SwiftUI / Kotlin / HealthKit / ARKit as specified in the stack ad.
