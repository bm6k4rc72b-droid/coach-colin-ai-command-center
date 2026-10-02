/**
 * Preview player and exporter. Everything is drawn to one canvas, so the same pixels can be
 * recorded: MediaRecorder captures canvas.captureStream() plus the audio graph's output.
 */
import type { Segment } from '../core/highlights';
import type { Source } from './source';

export class Player {
  ac: AudioContext;
  src: Source | null = null;
  t = 0;
  playing = false;
  /** Segments being played back to back (a reel), or null for normal playback. */
  reel: Segment[] | null = null;
  reelIndex = 0;
  onEnd: (() => void) | null = null;
  private node: AudioBufferSourceNode | null = null;
  private startAc = 0;
  private startT = 0;
  private record: MediaStreamAudioDestinationNode;
  private videoNodes = new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>();
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ac = new AudioContext();
    this.record = this.ac.createMediaStreamDestination();
    this.ctx = canvas.getContext('2d')!;
  }

  setSource(src: Source): void {
    this.stop();
    this.src = src;
    this.t = 0;
    if (src.video && !this.videoNodes.has(src.video)) {
      const n = this.ac.createMediaElementSource(src.video);
      n.connect(this.ac.destination);
      n.connect(this.record);
      this.videoNodes.set(src.video, n);
    }
    void this.seek(0);
  }

  async seek(t: number): Promise<void> {
    if (!this.src) return;
    const was = this.playing;
    this.pauseMedia();
    this.t = Math.max(0, Math.min(t, this.src.duration));
    await this.src.frameAt(this.ctx, this.canvas.width, this.canvas.height, this.t);
    if (was) this.startMedia();
  }

  play(from = this.t): void {
    if (!this.src) return;
    void this.ac.resume();
    this.reel = null;
    this.t = from >= this.src.duration - 0.1 ? 0 : from;
    this.playing = true;
    this.startMedia();
  }

  playReel(segs: Segment[]): void {
    if (!this.src || !segs.length) return;
    void this.ac.resume();
    this.reel = segs;
    this.reelIndex = 0;
    this.t = segs[0].start;
    this.playing = true;
    this.startMedia();
  }

  pause(): void {
    this.pauseMedia();
    this.playing = false;
  }

  stop(): void {
    this.pause();
    this.reel = null;
  }

  private startMedia(): void {
    const s = this.src!;
    if (s.buffer) {
      this.node = this.ac.createBufferSource();
      this.node.buffer = s.buffer;
      this.node.connect(this.ac.destination);
      this.node.connect(this.record);
      this.node.start(0, this.t);
      this.startAc = this.ac.currentTime;
      this.startT = this.t;
    } else if (s.video) {
      s.video.currentTime = this.t;
      void s.video.play();
    }
  }

  private pauseMedia(): void {
    if (this.node) {
      try {
        this.node.stop();
      } catch {
        /* already stopped */
      }
      this.node.disconnect();
      this.node = null;
    }
    this.src?.video?.pause();
  }

  /** Advance the clock, hop between reel segments, and draw. Call every animation frame. */
  tick(): void {
    const s = this.src;
    if (!s) return;
    if (this.playing) {
      this.t = s.buffer ? this.startT + (this.ac.currentTime - this.startAc) : s.video!.currentTime;
      const end = this.reel ? this.reel[this.reelIndex].end : s.duration;
      if (this.t >= end - 0.02) {
        if (this.reel && this.reelIndex < this.reel.length - 1) {
          this.pauseMedia();
          this.reelIndex++;
          this.t = this.reel[this.reelIndex].start;
          this.startMedia();
        } else {
          this.pause();
          this.reel = null;
          const cb = this.onEnd;
          this.onEnd = null;
          cb?.();
        }
      }
      s.drawNow(this.ctx, this.canvas.width, this.canvas.height, this.t);
    }
  }

  static mimeType(): string {
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    return types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? '';
  }

  /** Play the reel while recording the canvas and audio; resolves with the encoded video. */
  exportReel(segs: Segment[], onProgress: (frac: number) => void): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const mime = Player.mimeType();
      if (!mime || !('captureStream' in this.canvas)) return reject(new Error('This browser cannot record video (MediaRecorder unavailable).'));
      const stream = new MediaStream([...this.canvas.captureStream(30).getVideoTracks(), ...this.record.stream.getAudioTracks()]);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4e6 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        clearInterval(timer);
        resolve(new Blob(chunks, { type: mime.split(';')[0] }));
      };
      const total = segs.reduce((a, s) => a + s.end - s.start, 0);
      const timer = setInterval(() => {
        if (!this.reel) return;
        const done = segs.slice(0, this.reelIndex).reduce((a, s) => a + s.end - s.start, 0) + (this.t - segs[this.reelIndex].start);
        onProgress(Math.min(1, done / total));
      }, 200);
      rec.start(250);
      this.onEnd = () => rec.stop();
      this.playReel(segs);
    });
  }
}
