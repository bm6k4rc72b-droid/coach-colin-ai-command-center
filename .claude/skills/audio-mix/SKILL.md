---
name: audio-mix
description: Add, mix and sync audio for short-form video with ffmpeg, moviepy, auto-editor, librosa and BeatScope. Use when the user wants to add music or a voiceover to a video, duck music under speech, normalize loudness for TikTok/Reels/Shorts, cut silences or dead air, find the beat or tempo of a song, cut clips on the beat, or build a music video from clips.
---

# Audio mix

## Setup
Run once per machine (Linux/macOS; needs `uv` and `ffmpeg`):
```bash
"$CLAUDE_PROJECT_DIR"/.claude/skills/audio-mix/scripts/setup.sh
```
Python with moviepy + librosa: `~/.local/share/audio-mix/venv/bin/python`. CLIs: `auto-editor`, `beatscope`.

## Pick the tool
| Job | Tool |
|---|---|
| Voiceover over music, music ducks under the voice | ffmpeg recipe 1 |
| Loudness for social (about -14 LUFS, peaks under -1.5 dB) | ffmpeg recipe 2 |
| Replace or add a music bed with fades | ffmpeg recipe 3 |
| Cut silences / dead air from a talking-head video | `auto-editor` |
| Tempo, beat grid and strongest hits of a song | `scripts/beats.py` |
| Deep music map (sections, accents, stems) for a beat-synced edit | `beatscope` + the beatscope-visualizer skill |
| Audio-reactive music video from a pile of clips | the aeon-music-video skill |
| Programmatic compositing in Python | moviepy |

## Recipes
1. **Voiceover + ducked music** (voice starts at 1.5s):
```bash
ffmpeg -i video.mp4 -i vo.wav -filter_complex "[1:a]aresample=48000,aformat=channel_layouts=stereo,highpass=f=80,acompressor=threshold=-18dB:ratio=3,loudnorm=I=-15:TP=-1.5,adelay=1500|1500,apad,asplit=2[vk][vm];[0:a]aformat=channel_layouts=stereo[mu];[mu][vk]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=300[duck];[duck][vm]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k out.mp4
```
2. **Normalize for social**: `ffmpeg -i in.mp4 -af loudnorm=I=-14:TP=-1.5:LRA=9 -c:v copy -c:a aac -b:a 192k out.mp4`
3. **New music bed with fades** (track trimmed to the video):
```bash
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4)
ffmpeg -i video.mp4 -i song.mp3 -filter_complex "[1:a]atrim=0:$D,afade=t=in:d=0.5,afade=t=out:st=$(echo "$D-1"|bc):d=1,loudnorm=I=-14:TP=-1.5[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest out.mp4
```
4. **Cut silences**: `auto-editor talk.mp4 --margin 0.15s -o talk_tight.mp4`
5. **Beat grid**: `~/.local/share/audio-mix/venv/bin/python "$CLAUDE_PROJECT_DIR"/.claude/skills/audio-mix/scripts/beats.py song.mp3 --top 12`
   Put cuts on `beats`, flashes and hits on `strongest_hits`.

## Rules
- Only use music the user owns, licensed or royalty-free tracks, or original music. Trending sounds on TikTok/Instagram are licensed inside those apps: tell the user to add them in-app instead of baking them into the file.
- Check the result: `ffmpeg -i out.mp4 -af volumedetect -f null -` (peaks should sit below 0 dB).
