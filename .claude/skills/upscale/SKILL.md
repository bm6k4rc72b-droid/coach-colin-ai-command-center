---
name: upscale
description: Upscale or restore images and video with Video2X (Real-ESRGAN, Real-CUGAN, RIFE frame interpolation, Anime4K), Upscayl's engine (upscayl-bin) and GFPGAN face restoration. Use when the user wants to upscale, sharpen, enhance, de-blur or raise the resolution of a video, clip, frame, thumbnail or photo, smooth slow motion or raise frame rate, or fix blurry or low-quality faces.
---

# Upscale: Video2X, Upscayl, GFPGAN

Three tools, one job each:

| Tool | Command | Use it for |
|---|---|---|
| Video2X 6.4.0 | `video2x` | Video: upscaling (Real-ESRGAN, Real-CUGAN, Anime4K) and frame interpolation (RIFE) |
| Upscayl engine | `upscayl-bin` | Stills: thumbnails, posters, frames |
| GFPGAN v1.4 | `gfpgan` | Faces: restores blurry or low-res faces in stills |

GFPGAN is a separate tool; Video2X does not include it. For faces in video, extract frames,
run `gfpgan` on them, then re-encode (see the end of this file).

## Setup

If `command -v video2x upscayl-bin gfpgan` is missing any of them, run (Linux x86_64):

```bash
"$CLAUDE_PROJECT_DIR"/.claude/skills/upscale/scripts/setup.sh          # all three
"$CLAUDE_PROJECT_DIR"/.claude/skills/upscale/scripts/setup.sh upscayl  # or just one: video2x | upscayl | gfpgan
```

It installs into `~/.local/share/upscalers` with wrappers in `~/.local/bin`, pinned versions,
and is safe to re-run. GFPGAN pulls PyTorch (several GB), so install it only when needed.
On a machine with no GPU it installs Mesa's CPU Vulkan driver so the tools still run.

## Speed: check before long jobs

Run `video2x --list-devices`. If the only device is `llvmpipe` (Type: CPU), there is no GPU:
- Video: about 0.7 frames per second even at tiny sizes. Only do short previews (a second or
  two, downscaled) and tell the user to run full jobs on a GPU machine.
- Stills: `upscayl-lite-4x` takes seconds on a small image; heavy models take minutes.
- GFPGAN: about 20 s per image on CPU.
With a GPU, the same commands run roughly 50–100× faster.

Don't upscale footage that is already at or above the target size. 4K source cropped to
1080×1920 only needs ffmpeg scaling.

## Video2X (video)

```bash
# 2x upscale, fast general model (good for real footage too)
video2x -i in.mp4 -o out.mp4 -p realesrgan -s 2 --realesrgan-model realesr-animevideov3
# 4x, heavier photographic model
video2x -i in.mp4 -o out.mp4 -p realesrgan -s 4 --realesrgan-model realesrgan-plus
# Anime / cartoon / code-rendered styles (e.g. Lemo-Opuscar films): Real-CUGAN or Anime4K
video2x -i in.mp4 -o out.mp4 -p realcugan -s 2 -n 0 --realcugan-model models-se
video2x -i in.mp4 -o out.mp4 -p libplacebo -w 3840 -h 2160 --libplacebo-shader anime4k-v4-a
# Smoother slow motion: double the frame rate with RIFE
video2x -i in.mp4 -o out.mp4 -p rife -m 2 --rife-model rife-v4.6
```

Audio and subtitles are copied by default. Pick the GPU with `-d <index>`.

## Upscayl engine (stills)

```bash
upscayl-bin -i in.png -o out.png -n upscayl-standard-4x -s 4    # balanced default
upscayl-bin -i in.png -o out.png -n upscayl-lite-4x -s 4        # fastest
upscayl-bin -i in.png -o out.png -n high-fidelity-4x -s 4       # photos, keeps texture
upscayl-bin -i in.png -o out.png -n ultrasharp-4x -s 4          # crisp edges
upscayl-bin -i in.png -o out.png -n digital-art-4x -s 4         # illustrations, renders
```

Other models: `remacri-4x`, `ultramix-balanced-4x`. `-s 2` downsamples the 4× result to 2×.
Folders work: `-i frames/ -o frames_up/`.

## GFPGAN (faces)

```bash
gfpgan -i photo.jpg -o out_dir -v 1.4 -s 2 --bg_upsampler none
gfpgan -i frames_dir -o out_dir -v 1.4 -s 1 --bg_upsampler none --only_center_face
```

Results: `out_dir/restored_imgs/` (whole image), plus `restored_faces/`, `cropped_faces/`
and `cmp/` (before/after). It only fixes faces it can detect, so helmets and side profiles
are often skipped. It can change how a person looks, so show the user before and after.

## Faces in video

```bash
mkdir -p f fx && ffmpeg -i in.mp4 -qscale:v 1 f/%05d.png
gfpgan -i f -o fx -v 1.4 -s 1 --bg_upsampler none
ffmpeg -framerate 30 -i fx/restored_imgs/%05d.png -i in.mp4 -map 0:v -map 1:a? -c:v libx264 -crf 17 -pix_fmt yuv420p -c:a copy out.mp4
```
