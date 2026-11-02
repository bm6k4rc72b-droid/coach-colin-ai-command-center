/**
 * The export renderer: plays the clip once in real time into a 9:16 canvas and records it.
 *
 *   auto-reframe   a virtual camera follows the subject (pose centre, else face) with a
 *                  dead zone and smoothing, so 16:9 footage becomes 9:16 without jitter
 *   privacy        faces pixelated (BlazeFace), or skeleton-only (pose on black), which is
 *                  how VIGIL / ElderGuardian footage of residents should go out
 *   skeleton       the pose overlay people stop scrolling for
 *   captions       word-by-word captions from Whisper, the active word in the accent colour
 *   hook title     the on-screen hook for the first seconds
 *   progress bar   a thin bar that tells viewers the clip is short
 *
 * Output is MP4 where the browser can record it (Safari, recent Chrome), WebM otherwise.
 *
 * @module viralforge/render
 */
import { cropRect, SmoothCam, captionAt } from './core.js';
import { faceDetector, poseLandmarker, POSE_EDGES } from './ai.js';

export function pickMime() {
  const c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {File} file
 * @param {HTMLCanvasElement} canvas  the visible preview canvas (drawn into while rendering)
 * @param {object} o options (see the module doc)
 * @param {(frac:number)=>void} onProgress
 * @returns {{done: Promise<Blob|null>, stop: ()=>void}}
 */
export function renderClip(file, canvas, o, onProgress = () => {}) {
  let stopped = false;
  const done = (async () => {
    const outW = o.width || 1080, outH = o.height || 1920;
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    const v = document.createElement('video');
    v.src = URL.createObjectURL(file); v.playsInline = true; v.preload = 'auto';
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('Cannot decode video')); });
    const W = v.videoWidth, H = v.videoHeight;

    const needPose = o.reframe || o.skeleton || o.skeletonOnly;
    const pose = needPose ? await poseLandmarker().catch(() => null) : null;
    const face = o.blurFaces || o.reframe ? await faceDetector().catch(() => null) : null;

    let stream = null, rec = null, vtrack = null; const chunks = [];
    if (o.record) {
      // Push each drawn frame explicitly (captureStream(0) + requestFrame): browsers otherwise
      // skip frames from a canvas that is off-screen or not yet composited.
      stream = canvas.captureStream(0);
      vtrack = stream.getVideoTracks()[0];
      if (!vtrack || typeof vtrack.requestFrame !== 'function') { stream = canvas.captureStream(30); vtrack = null; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        const ac = new AC();
        const src = ac.createMediaElementSource(v);
        const dest = ac.createMediaStreamDestination();
        src.connect(dest);
        if (o.monitor) src.connect(ac.destination);
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        await ac.resume();
      } catch (e) { console.warn('audio capture', e); }
      const mimeType = o.mime || pickMime();
      rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: o.bitrate || 8_000_000 });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    } else {
      v.muted = true;
    }

    const cam = new SmoothCam({ alpha: 0.1, dead: 0.05 });
    const aspect = o.reframe ? outW / outH : W / H;
    let lastPose = [], lastFaces = [];
    const last = { pose: -1e9, face: -1e9 }, cost = { pose: 0, face: 0 };
    const accent = o.accent || '#ff2d55';
    const tiny = document.createElement('canvas');

    const draw = () => {
      const t = v.currentTime;
      // Detection on a time budget: each model runs at most every 4× its own cost (and never
      // faster than ~15 Hz), so a slow device keeps drawing every frame with a slightly older
      // skeleton instead of dropping frames.
      const now = performance.now();
      const due = (k) => now - last[k] >= Math.max(66, 4 * cost[k]);
      if (pose && due('pose')) {
        try { lastPose = pose.detectForVideo(v, now).landmarks || []; } catch { /* keep last */ }
        cost.pose = performance.now() - now; last.pose = now;
      }
      if (face && (o.blurFaces || o.reframe) && due('face')) {
        const t0 = performance.now();
        try { lastFaces = face.detectForVideo(v, t0).detections.map((d) => d.boundingBox); } catch { /* keep last */ }
        cost.face = performance.now() - t0; last.face = t0;
      }

      // Subject x for the virtual camera.
      let sx = null;
      if (lastPose.length) {
        const biggest = lastPose.map((lm) => { const xs = lm.map((p) => p.x); return { lm, span: Math.max(...xs) - Math.min(...xs) }; }).sort((a, b) => b.span - a.span)[0].lm;
        const pts = [11, 12, 23, 24].map((i) => biggest[i]).filter((p) => p && (p.visibility ?? 1) > 0.3);
        if (pts.length) sx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      } else if (lastFaces.length) {
        const b = lastFaces[0]; sx = (b.originX + b.width / 2) / W;
      }
      const cx = o.reframe ? cam.update(sx) : 0.5;
      const cr = cropRect(W, H, aspect, cx, 0.5);
      // Fit crop into the output (letterbox only if not reframing).
      const scale = Math.min(outW / cr.w, outH / cr.h);
      const dw = cr.w * scale, dh = cr.h * scale, dx = (outW - dw) / 2, dy = (outH - dh) / 2;
      const map = (x, y) => [dx + ((x - cr.x) / cr.w) * dw, dy + ((y - cr.y) / cr.h) * dh];

      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, outW, outH);
      if (!o.skeletonOnly) {
        if (!o.reframe) { ctx.filter = 'blur(40px) brightness(0.5)'; ctx.drawImage(v, 0, 0, outW, outH); ctx.filter = 'none'; }
        ctx.drawImage(v, cr.x, cr.y, cr.w, cr.h, dx, dy, dw, dh);
      }

      // Privacy: pixelate faces.
      if (o.blurFaces && !o.skeletonOnly) {
        for (const b of lastFaces) {
          const pad = 0.25;
          const [x0, y0] = map(b.originX - b.width * pad, b.originY - b.height * pad);
          const [x1, y1] = map(b.originX + b.width * (1 + pad), b.originY + b.height * (1 + pad));
          const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
          tiny.width = Math.max(1, Math.round(w / 28)); tiny.height = Math.max(1, Math.round(h / 28));
          const tc = tiny.getContext('2d');
          tc.drawImage(canvas, x0, y0, w, h, 0, 0, tiny.width, tiny.height);
          ctx.save(); ctx.imageSmoothingEnabled = false;
          ctx.beginPath(); ctx.ellipse(x0 + w / 2, y0 + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.clip();
          ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, x0, y0, w, h); ctx.restore();
        }
      }

      // Skeleton.
      if (o.skeleton || o.skeletonOnly) {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, outW / 160);
        ctx.strokeStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 18;
        for (const lm of lastPose) {
          for (const [a, b] of POSE_EDGES) {
            const p = lm[a], q = lm[b];
            if (!p || !q || (p.visibility ?? 1) < 0.4 || (q.visibility ?? 1) < 0.4) continue;
            const [ax, ay] = map(p.x * W, p.y * H), [bx, by] = map(q.x * W, q.y * H);
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          }
          ctx.fillStyle = '#fff'; ctx.shadowBlur = 8;
          for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
            const p = lm[i]; if (!p || (p.visibility ?? 1) < 0.4) continue;
            const [px, py] = map(p.x * W, p.y * H); ctx.beginPath(); ctx.arc(px, py, ctx.lineWidth * 0.9, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      }

      const font = o.font || '800 {s}px "Inter", "Helvetica Neue", Arial, sans-serif';
      // Hook title.
      if (o.hookText && t < (o.hookDur ?? 3)) {
        const s = Math.round(outW / 13);
        const pop = Math.min(1, t / 0.18);
        ctx.save();
        ctx.font = font.replace('{s}', s); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const lines = wrap(ctx, o.hookText.toUpperCase(), outW * 0.84);
        const lh = s * 1.18, y0 = outH * 0.2 - ((lines.length - 1) * lh) / 2;
        ctx.translate(outW / 2, outH * 0.2); ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop); ctx.translate(-outW / 2, -outH * 0.2);
        lines.forEach((ln, i) => {
          const w = ctx.measureText(ln).width + s * 0.6, y = y0 + i * lh;
          ctx.fillStyle = i % 2 ? '#fff' : accent; ctx.fillRect(outW / 2 - w / 2, y - lh / 2 + 4, w, lh - 8);
          ctx.fillStyle = i % 2 ? '#000' : '#fff'; ctx.fillText(ln, outW / 2, y + 2);
        });
        ctx.restore();
      }

      // Captions.
      if (o.captions?.length) {
        const card = captionAt(o.captions, t);
        if (card) {
          const s = Math.round(outW / 11);
          ctx.save();
          ctx.font = font.replace('{s}', s); ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
          const words = card.words.map((w) => w.text.toUpperCase());
          const widths = words.map((w) => ctx.measureText(w + ' ').width);
          let x = outW / 2 - widths.reduce((a, b) => a + b, 0) / 2; const y = outH * 0.72;
          words.forEach((w, i) => {
            const active = t >= card.words[i].start && t < card.words[i].end + 0.05;
            ctx.lineWidth = s / 6; ctx.strokeStyle = '#000'; ctx.strokeText(w, x, y);
            ctx.fillStyle = active ? (o.captionAccent || '#ffe600') : '#fff'; ctx.fillText(w, x, y);
            x += widths[i];
          });
          ctx.restore();
        }
      }

      // Progress bar.
      if (o.progressBar !== false && v.duration) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, outH - 10, outW, 10);
        ctx.fillStyle = accent; ctx.fillRect(0, outH - 10, outW * (t / v.duration), 10);
      }
      if (o.watermark) {
        ctx.font = `600 ${Math.round(outW / 36)}px Inter, Arial, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.textAlign = 'right';
        ctx.fillText(o.watermark, outW - 28, outH - 40); ctx.textAlign = 'left';
      }
      vtrack?.requestFrame();
      onProgress(v.duration ? t / v.duration : 0);
    };

    const tick = () => {
      if (stopped || v.ended) return;
      draw();
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
    };
    // Warm the models on the first frame before anything starts: the first call compiles
    // shaders and can block for seconds, which would otherwise eat the start of the clip.
    await new Promise((r) => { if (v.readyState >= 2) r(); else v.onloadeddata = r; });
    for (let i = 0; i < 2; i++) try { pose?.detectForVideo(v, performance.now()); } catch { /* warm-up only */ }
    try { face?.detectForVideo(v, performance.now()); } catch { /* warm-up only */ }
    rec?.start(250);
    await v.play();
    tick();
    await new Promise((r) => { v.onended = r; const iv = setInterval(() => { if (stopped) { clearInterval(iv); r(); } }, 200); });
    draw();
    v.pause();
    URL.revokeObjectURL(v.src);
    if (!rec) return null;
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
    stream.getTracks().forEach((t) => t.stop());
    return new Blob(chunks, { type: rec.mimeType || 'video/webm' });
  })();
  return { done, stop: () => { stopped = true; } };
}
