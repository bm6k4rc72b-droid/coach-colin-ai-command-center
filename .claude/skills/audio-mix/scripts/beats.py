#!/usr/bin/env python3
"""Print a song's tempo, beat times and strongest onsets as JSON, for cutting video on the beat.
usage: beats.py song.mp3 [--top 12]"""
import json, sys
import librosa, numpy as np

path = sys.argv[1]
top = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 12
y, sr = librosa.load(path, sr=22050, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
env = librosa.onset.onset_strength(y=y, sr=sr)
onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, units="frames")
strength = env[onsets]
order = np.argsort(strength)[::-1][:top]
hits = sorted(float(librosa.frames_to_time(onsets[i], sr=sr)) for i in order)
print(json.dumps({"duration": round(len(y) / sr, 3), "tempo_bpm": round(float(np.atleast_1d(tempo)[0]), 1),
                  "beats": [round(float(b), 3) for b in beats], "strongest_hits": [round(h, 3) for h in hits]}, indent=1))
