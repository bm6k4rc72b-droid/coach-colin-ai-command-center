import { useEffect, useMemo, useRef } from 'react';
import { GROUP_STYLE } from '../data/regions';
import { DURATION, SCENARIOS } from '../data/scenarios';
import { crossover, curves } from '../sim/activity';
import { clock } from '../sim/clock';
import { useBrain } from '../state/store';
import { Segmented } from './controls';
import { IconPause, IconPlay } from './icons';

const W = 400;
const H = 52;

function path(values: number[]) {
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 3 - v * (H - 8)).toFixed(1)}`)
    .join(' ');
}

export function Timeline() {
  const scenarioId = useBrain((s) => s.scenarioId);
  const mods = useBrain((s) => s.mods);
  const playing = useBrain((s) => s.playing);
  const speed = useBrain((s) => s.speed);
  const { play, pause, setSpeed } = useBrain.getState();
  const sc = SCENARIOS.find((s) => s.id === scenarioId)!;
  const c = useMemo(() => curves(sc, mods, DURATION), [sc, mods]);
  const cross = useMemo(() => crossover(sc, mods, DURATION), [sc, mods]);

  const head = useRef<SVGLineElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Follow the clock without React renders.
  useEffect(() => {
    const draw = (t: number) => {
      const x = (t / DURATION) * W;
      head.current?.setAttribute('x1', String(x));
      head.current?.setAttribute('x2', String(x));
      if (readout.current) readout.current.textContent = `${Math.round(t).toLocaleString()} ms`;
      if (input.current && document.activeElement !== input.current) input.current.value = String(Math.round(t));
    };
    draw(clock.t);
    clock.listeners.add(draw);
    return () => void clock.listeners.delete(draw);
  }, []);

  return (
    <section className="panel timeline" aria-label="Timeline">
      <div className="tl-head">
        <button type="button" className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => (playing ? pause() : play())}>
          {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
        </button>
        <div className="tl-title">
          <span className="tl-name">After the trigger</span>
          <span className="tl-time" ref={readout}>
            0 ms
          </span>
        </div>
        <Segmented<string>
          id="speed"
          label="Playback speed"
          value={String(speed)}
          onChange={(v) => setSpeed(Number(v))}
          options={[
            { value: '0.125', label: '⅛×' },
            { value: '0.25', label: '¼×' },
            { value: '1', label: '1×' },
          ]}
        />
      </div>
      <div className="tl-graph">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          {sc.phases.map((p, i) => (
            <line key={i} x1={(p.at / DURATION) * W} x2={(p.at / DURATION) * W} y1={0} y2={H} className="tick" />
          ))}
          {cross !== null && (
            <line x1={(cross / DURATION) * W} x2={(cross / DURATION) * W} y1={0} y2={H} className="cross" />
          )}
          <path d={path(c.fast)} className="curve" style={{ stroke: GROUP_STYLE.fast.color }} />
          <path d={path(c.slow)} className="curve" style={{ stroke: GROUP_STYLE.slow.color }} />
          <line ref={head} x1={0} x2={0} y1={0} y2={H} className="playhead" />
        </svg>
        <input
          ref={input}
          className="scrub"
          type="range"
          min={0}
          max={DURATION}
          defaultValue={0}
          aria-label="Time after trigger"
          onPointerDown={() => pause()}
          onChange={(e) => clock.set(Number(e.target.value))}
        />
      </div>
      <div className="tl-foot">
        <span>
          <span className="swatch" style={{ background: GROUP_STYLE.fast.color }} />
          Feeling (amygdala, insula)
        </span>
        <span>
          <span className="swatch" style={{ background: GROUP_STYLE.slow.color }} />
          Reasoning (prefrontal)
        </span>
        <span className="cross-label">
          {cross !== null ? (
            <>
              Reason overtakes at <strong>{cross.toLocaleString()} ms</strong>
            </>
          ) : (
            <strong>Feeling stays ahead</strong>
          )}
        </span>
      </div>
    </section>
  );
}
