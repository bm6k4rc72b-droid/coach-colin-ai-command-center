import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { timeline } from './timeline.js';

const GOLD = '#e8b84a';
const GOLD2 = '#ffd978';
const NEON = '#3fa2ff';
const font = 'Inter, "Helvetica Neue", Arial, sans-serif';
const display = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';

function Words({ text, kind }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = String(text).split(/\s+/);
  const size = kind === 'hook' ? 108 : kind === 'cta' ? 84 : 76;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 22px', padding: '0 70px' }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - i * 3, fps, config: { damping: 14, stiffness: 180 } });
        const hot = kind === 'hook' ? i < 3 : /^[A-Z0-9"“].*[A-Z]{2,}|\d/.test(w);
        return (
          <span key={i} style={{
            fontFamily: display, fontSize: size, lineHeight: 1, letterSpacing: 1, textTransform: 'uppercase',
            color: hot ? GOLD2 : '#fff', transform: `translateY(${(1 - s) * 40}px) scale(${0.85 + 0.15 * s})`, opacity: s,
            textShadow: `0 4px 24px rgba(0,0,0,.9), 0 0 ${hot ? 30 : 0}px ${hot ? 'rgba(232,184,74,.55)' : 'transparent'}`,
          }}>{w}</span>
        );
      })}
    </div>
  );
}

function Segment({ seg }) {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 6, seg.frames - 6, seg.frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: seg.kind === 'hook' ? 'center' : 'flex-end', paddingBottom: seg.kind === 'hook' ? 0 : 420, opacity: fade }}>
      {seg.kind === 'cta' && <div style={{ textAlign: 'center', fontFamily: font, fontWeight: 800, fontSize: 34, letterSpacing: 6, color: NEON, marginBottom: 24 }}>NEXT STEP</div>}
      <Words text={seg.text} kind={seg.kind} />
      {seg.audio && <Audio src={staticFile(seg.audio)} />}
    </AbsoluteFill>
  );
}

export function ColinReel(props) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { segs } = timeline(props, fps);
  const zoom = interpolate(frame, [0, durationInFrames], [1.08, 1.22]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#050507', fontFamily: font }}>
      <Img src={staticFile(props.background || 'colin.webp')} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`, filter: 'brightness(.55) saturate(1.1)' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(5,5,7,.55) 0%, rgba(5,5,7,0) 30%, rgba(5,5,7,.2) 55%, rgba(5,5,7,.92) 100%)' }} />
      {props.disclosure && (
        <div style={{ position: 'absolute', top: 90, left: 0, right: 0, textAlign: 'center' }}>
          <span style={{ background: 'rgba(0,0,0,.65)', border: `2px solid ${GOLD}`, color: GOLD2, fontWeight: 700, fontSize: 30, padding: '10px 22px', borderRadius: 14 }}>{props.disclosure}</span>
        </div>
      )}
      {segs.map((s) => (
        <Sequence key={s.index} from={s.from} durationInFrames={s.frames}><Segment seg={s} /></Sequence>
      ))}
      {props.onScreen && frame < (segs[0]?.frames ?? 0) + fps * 2 && (
        <div style={{ position: 'absolute', top: 230, left: 60, right: 60, textAlign: 'center', fontFamily: display, fontSize: 64, color: '#fff', background: GOLD, WebkitTextFillColor: '#120d02', padding: '8px 16px', borderRadius: 10 }}>{props.onScreen}</div>
      )}
      <div style={{ position: 'absolute', bottom: 120, left: 0, right: 0, textAlign: 'center', color: '#ddd', fontWeight: 700, fontSize: 34, letterSpacing: 2 }}>{props.handle}</div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, height: 10, width: `${(100 * frame) / durationInFrames}%`, background: `linear-gradient(90deg, ${GOLD}, ${GOLD2})` }} />
    </AbsoluteFill>
  );
}
