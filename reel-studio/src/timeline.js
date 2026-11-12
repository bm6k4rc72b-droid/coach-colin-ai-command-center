/**
 * Turns a COLIN OS script into timed segments. Pure, so it is tested without rendering.
 * A segment lasts as long as its voice-over when one exists, else as long as it takes to read.
 */
export const FPS = 30;
const WPS = 2.6; // spoken words per second for a punchy coach delivery

export function segments(props) {
  const list = [
    { kind: 'hook', text: props.hook },
    ...(props.beats || []).map((text) => ({ kind: 'beat', text })),
    { kind: 'cta', text: props.cta },
  ].filter((s) => s.text && String(s.text).trim());
  return list.map((s, i) => {
    const vo = props.audio?.[i];
    const words = String(s.text).trim().split(/\s+/).length;
    const read = Math.max(s.kind === 'hook' ? 2 : 2.4, words / WPS + 0.6);
    const seconds = vo?.seconds ? vo.seconds + 0.25 : read;
    return { ...s, index: i, seconds: Math.round(seconds * 100) / 100, audio: vo?.src || null };
  });
}

/** Frame layout: each segment's start frame and length. */
export function timeline(props, fps = FPS) {
  let at = 0;
  const segs = segments(props).map((s) => {
    const frames = Math.round(s.seconds * fps);
    const out = { ...s, from: at, frames };
    at += frames;
    return out;
  });
  return { segs, total: Math.max(at, fps) };
}

/** Duration of a PCM WAV file from its header (VoiceStudio returns WAV when asked). */
export function wavSeconds(buf) {
  const b = Buffer.from(buf);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file');
  let off = 12; let byteRate = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(off + 16);
    if (id === 'data') { if (!byteRate) throw new Error('WAV has no fmt chunk'); return Math.min(size, b.length - off - 8) / byteRate; }
    off += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}
