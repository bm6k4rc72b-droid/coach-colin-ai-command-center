/**
 * A clip to analyse and cut: either the synthetic demo match (drawn on demand, soundtrack
 * generated) or the user's own video file (decoded locally — nothing is uploaded).
 */
import { demoAudio, drawDemo, DEMO_DURATION, type Painter } from '../core/demo';

export interface Source {
  kind: 'demo' | 'file';
  name: string;
  duration: number;
  /** Draw the frame at time t (seeks the video for files). */
  frameAt(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): Promise<void>;
  /** Draw whatever frame is current (during playback). */
  drawNow(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  /** Mono audio for analysis, or null if the clip has none / it can't be decoded. */
  audio(): Promise<{ samples: Float32Array; rate: number } | null>;
  video?: HTMLVideoElement;
  /** Demo only: the generated soundtrack for playback. */
  buffer?: AudioBuffer;
  dispose(): void;
}

export function canvasPainter(ctx: CanvasRenderingContext2D): Painter {
  return {
    rect: (x, y, w, h, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    },
    circle: (x, y, r, c) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    text: (s, x, y, size, c) => {
      ctx.fillStyle = c;
      ctx.font = `700 ${Math.round(size)}px system-ui, sans-serif`;
      ctx.fillText(s, x, y);
    },
  };
}

export const DEMO_RATE = 16000;

export function demoSource(ac: BaseAudioContext): Source {
  const samples = demoAudio(DEMO_RATE);
  const buffer = ac.createBuffer(1, samples.length, DEMO_RATE);
  buffer.getChannelData(0).set(samples);
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => drawDemo(canvasPainter(ctx), w, h, t);
  return {
    kind: 'demo',
    name: 'Demo match (synthetic, 60 s)',
    duration: DEMO_DURATION,
    frameAt: async (ctx, w, h, t) => draw(ctx, w, h, t),
    drawNow: draw,
    audio: async () => ({ samples, rate: DEMO_RATE }),
    buffer,
    dispose: () => {},
  };
}

const once = (el: HTMLMediaElement, ev: string) =>
  new Promise<void>((res, rej) => {
    const ok = () => {
      el.removeEventListener('error', bad);
      res();
    };
    const bad = () => {
      el.removeEventListener(ev, ok);
      rej(new Error('This video could not be decoded by your browser.'));
    };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });

/** Letterbox a video into w × h. */
function drawVideo(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, w: number, h: number): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const s = Math.min(w / v.videoWidth, h / v.videoHeight);
  const dw = v.videoWidth * s;
  const dh = v.videoHeight * s;
  ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export async function fileSource(file: File): Promise<Source> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.preload = 'auto';
  v.playsInline = true;
  v.crossOrigin = 'anonymous';
  v.src = url;
  await once(v, 'loadeddata');
  if (v.duration === Infinity) {
    // Recorded WebM files (MediaRecorder) often omit their duration; seeking far ahead makes the browser compute it.
    const p = once(v, 'seeked');
    v.currentTime = 1e101;
    await p;
    v.currentTime = 0;
    await once(v, 'seeked');
  }
  if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error('Could not read the video length.');
  return {
    kind: 'file',
    name: file.name,
    duration: v.duration,
    video: v,
    frameAt: async (ctx, w, h, t) => {
      if (Math.abs(v.currentTime - t) > 0.01) {
        const p = once(v, 'seeked');
        v.currentTime = Math.min(t, v.duration - 0.05);
        await p;
      }
      drawVideo(ctx, v, w, h);
    },
    drawNow: (ctx, w, h) => {
      if (v.readyState >= 2) drawVideo(ctx, v, w, h);
    },
    audio: async () => {
      try {
        const data = await file.arrayBuffer();
        const ac = new OfflineAudioContext(1, 1, 22050);
        const buf = await ac.decodeAudioData(data);
        const mono = new Float32Array(buf.length);
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const ch = buf.getChannelData(c);
          for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
        }
        return { samples: mono, rate: buf.sampleRate };
      } catch {
        return null;
      }
    },
    dispose: () => {
      v.pause();
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
    },
  };
}
