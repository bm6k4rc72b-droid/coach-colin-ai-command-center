/**
 * Getting the episode out of the tab.
 *
 * Recording happens in real time, from a `captureStream` on the same canvas the
 * preview draws to, because that is the only path in a browser where the frame
 * timestamps a player will read match the timeline the frames were drawn from.
 * The alternative — pushing frames as fast as they render and letting the
 * recorder stamp them by wall clock — produces a file whose speed depends on
 * how fast the machine is, which is a bug that only shows up on someone else's
 * laptop.
 *
 * The consequence is honest and worth stating in the UI: a 40-second episode
 * takes 40 seconds to export, and the tab has to stay in front. Background tabs
 * are throttled to roughly one frame a second, which would record a slideshow.
 *
 * @module carrier/export
 */

/** Container and codec preferences, best first. Safari takes the MP4. */
const MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/**
 * The best container this browser will record.
 *
 * @returns {string} A MIME type, or an empty string to let the browser choose.
 */
export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

/**
 * Whether this browser can record a canvas at all.
 *
 * @returns {boolean} True if recording is available.
 */
export function canRecord() {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/**
 * The file extension for a recorded blob.
 *
 * @param {string} mime MIME type the recorder used.
 * @returns {string} `mp4` or `webm`.
 */
export function extensionFor(mime) {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

/**
 * Record an episode to a video file.
 *
 * @param {object} options Recording job.
 * @param {HTMLCanvasElement} options.canvas The canvas being drawn to.
 * @param {(t: number) => (void|Promise<void>)} options.draw Draws one frame at a time.
 * @param {number} options.seconds Running time.
 * @param {number} [options.fps=30] Capture rate.
 * @param {(progress: number) => void} [options.onProgress] 0..1, per frame.
 * @param {AbortSignal} [options.signal] Cancels the recording.
 * @returns {Promise<{blob: Blob, mime: string}>} The recorded file.
 */
export function recordEpisode({ canvas, draw, seconds, fps = 30, onProgress, signal }) {
  if (!canRecord()) {
    return Promise.reject(new Error('This browser cannot record a canvas. Export frames instead.'));
  }

  return new Promise((resolve, reject) => {
    const mime = pickMimeType();
    const stream = canvas.captureStream(fps);
    let recorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 12_000_000,
      });
    } catch (error) {
      reject(error);
      return;
    }

    /** @type {Blob[]} */
    const chunks = [];
    let frame = 0;
    let stopped = false;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onerror = (event) => {
      stopped = true;
      reject(event.error ?? new Error('The recorder failed.'));
    };
    recorder.onstop = () => {
      for (const track of stream.getTracks()) track.stop();
      resolve({ blob: new Blob(chunks, { type: mime || 'video/webm' }), mime: mime || 'video/webm' });
    };

    const finish = () => {
      if (stopped) return;
      stopped = true;
      if (recorder.state !== 'inactive') recorder.stop();
    };

    signal?.addEventListener('abort', finish, { once: true });

    const started = performance.now();
    const step = async () => {
      if (stopped) return;
      const t = (performance.now() - started) / 1000;
      if (t >= seconds) {
        // Draw the final frame so the file ends on the last thing authored.
        await draw(seconds);
        onProgress?.(1);
        setTimeout(finish, 120);
        return;
      }
      await draw(t);
      frame += 1;
      onProgress?.(Math.min(1, t / seconds));
      requestAnimationFrame(step);
    };

    recorder.start(200);
    requestAnimationFrame(step);
    void frame;
  });
}

/**
 * The current canvas contents as a PNG.
 *
 * @param {HTMLCanvasElement} canvas The canvas.
 * @returns {Promise<Blob>} The image.
 */
export function framePng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The frame could not be encoded.'));
    }, 'image/png');
  });
}

/**
 * Hand a blob to the browser as a download.
 *
 * @param {Blob} blob The file.
 * @param {string} name Suggested filename.
 * @returns {void}
 */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
