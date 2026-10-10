import { useEffect, useMemo, useRef } from 'react';
import { PEPTIDE_BY_ID } from '../data/peptides';
import { clock } from '../sim/clock';
import { formatDuration, level, model, tToU, uToT } from '../sim/pk';
import { useJourney } from '../state/store';
import { IconPause, IconPlay } from './icons';

const W = 440;
const H = 64;
const TICKS: Array<[number, string]> = [
  [1, '1 s'],
  [60, '1 min'],
  [3600, '1 h'],
  [86400, '1 day'],
  [7 * 86400, '1 week'],
  [30 * 86400, ''],
];

function curvePath(id: string) {
  const p = PEPTIDE_BY_ID[id];
  const pts: string[] = [];
  for (let i = 0; i <= 220; i++) {
    const u = i / 220;
    const v = level(p, uToT(u));
    pts.push(`${i === 0 ? 'M' : 'L'}${(u * W).toFixed(1)},${(H - 4 - v * (H - 12)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function Timeline() {
  const peptideId = useJourney((s) => s.peptideId);
  const playing = useJourney((s) => s.playing);
  const { play, pause } = useJourney.getState();
  const p = PEPTIDE_BY_ID[peptideId];
  const main = useMemo(() => curvePath(peptideId), [peptideId]);
  const ghost = useMemo(() => (p.compareWith ? curvePath(p.compareWith) : null), [p]);
  const peakU = tToU(model(p).peakT);

  const head = useRef<SVGLineElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const lvl = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const draw = (u: number) => {
      const x = u * W;
      head.current?.setAttribute('x1', String(x));
      head.current?.setAttribute('x2', String(x));
      const t = u > 0 ? uToT(u) : 0;
      if (time.current) time.current.textContent = u > 0 ? formatDuration(t) : '0 s';
      const pp = PEPTIDE_BY_ID[useJourney.getState().peptideId];
      if (lvl.current) lvl.current.textContent = `${Math.round(level(pp, t) * 100)}% of peak`;
      if (input.current && document.activeElement !== input.current) input.current.value = String(Math.round(u * 1000));
    };
    draw(clock.u);
    clock.listeners.add(draw);
    const unsub = useJourney.subscribe(() => draw(clock.u));
    return () => {
      clock.listeners.delete(draw);
      unsub();
    };
  }, []);

  return (
    <section className="panel timeline" aria-label="Time after release">
      <div className="tl-head">
        <button type="button" className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? pause() : play())}>
          {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
        </button>
        <div className="tl-title">
          <span className="tl-name">
            Time after {p.source.point ? 'injection' : 'release'} · <span ref={time}>0 s</span>
          </span>
          <span className="tl-time">
            Blood level <span ref={lvl}>0%</span> · half-life {p.halfLifeLabel.toLowerCase()}
          </span>
        </div>
      </div>
      <div className="tl-graph tall">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          {TICKS.map(([t]) => (
            <line key={t} x1={tToU(t) * W} x2={tToU(t) * W} y1={0} y2={H} className="tick" />
          ))}
          {ghost && <path d={ghost} className="curve ghost" />}
          <path d={main} className="curve" style={{ stroke: p.color }} />
          <line x1={peakU * W} x2={peakU * W} y1={4} y2={H} className="cross" style={{ stroke: p.color }} />
          <line ref={head} x1={0} x2={0} y1={0} y2={H} className="playhead" />
        </svg>
        <input
          ref={input}
          className="scrub"
          type="range"
          min={0}
          max={1000}
          defaultValue={0}
          aria-label="Time after release"
          onPointerDown={() => pause()}
          onChange={(e) => clock.set(Number(e.target.value) / 1000)}
        />
      </div>
      <div className="tl-axis">
        {TICKS.map(([t, label]) => (
          <span key={t} style={{ left: `${tToU(t) * 100}%` }}>
            {label}
          </span>
        ))}
      </div>
      {ghost && p.compareWith && (
        <div className="tl-foot">
          <span>
            <span className="swatch" style={{ background: p.color }} />
            {p.name}
          </span>
          <span>
            <span className="swatch dashed" />
            Natural {PEPTIDE_BY_ID[p.compareWith].name} ({PEPTIDE_BY_ID[p.compareWith].halfLifeLabel.toLowerCase()})
          </span>
        </div>
      )}
    </section>
  );
}
