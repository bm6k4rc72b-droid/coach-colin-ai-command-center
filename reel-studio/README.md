# Reel Studio · Coach Colin

Turns a COLIN OS script into a finished 1080×1920 Reel / TikTok / Short: animated kinetic captions over
Colin's photo, the `#ad` disclosure, on-screen hook, handle and progress bar. Optional voice-over in **your
cloned voice**, generated on your own machine by [VoiceStudio](https://github.com/debpalash/VoiceStudio).

Built with [Remotion](https://github.com/remotion-dev/remotion) ("make videos programmatically with React").

## Use it

```bash
cd reel-studio
npm install
# 1. In COLIN OS → Reel team → run the team → "Export to Reel Studio". Save the file as reel-studio/props.json
#    (or start from props.sample.json).
# 2. Optional voice-over: start VoiceStudio, clone your voice there, then
VOICESTUDIO_VOICE="Colin" npm run voiceover
# 3. Preview and tweak in the browser, then render
npm run studio
npm run render          # → out/reel.mp4
npm run still           # → out/cover.png (thumbnail)
```

Each scene lasts exactly as long as its voice-over line; without voice-over it lasts as long as the line takes to read.

## VoiceStudio

VoiceStudio runs locally (desktop app or backend) and exposes an OpenAI-compatible endpoint,
`POST http://localhost:3900/v1/audio/speech`. Loopback needs no key. Settings:
`VOICESTUDIO_URL`, `VOICESTUDIO_VOICE` (your voice profile name), `VOICESTUDIO_KEY` (only for a networked install).

VoiceStudio is **AGPL-3.0**, so it is used as a separate app over HTTP and not copied into this repository.
Only clone voices you own or have written permission to use.

## Licences

- Remotion is free for individuals and companies of up to 3 people; larger companies need a
  [company licence](https://www.remotion.dev/license).
- VoiceStudio: AGPL-3.0, run separately.

`npm test` checks the timing maths and the WAV reader.
