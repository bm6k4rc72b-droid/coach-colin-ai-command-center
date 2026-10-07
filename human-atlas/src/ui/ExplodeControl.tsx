import { useEffect, useRef } from 'react';
import { COLLECTIONS } from '../data/collections';
import { useAtlas } from '../state/store';
import { resetCamera } from './Toolbar';
import { IconExplode } from './icons';

export function ExplodeControl() {
  const explode = useAtlas((s) => s.explode);
  const collection = useAtlas((s) => s.collection);
  const setExplode = useAtlas((s) => s.setExplode);
  const pct = Math.round(explode * 100);
  const scrubbing = useRef(false);

  // Release "scrubbing" when the pointer is released anywhere.
  useEffect(() => {
    const up = () => {
      if (!scrubbing.current) return;
      scrubbing.current = false;
      const st = useAtlas.getState();
      st.setExplode(st.explode, false);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const caption =
    explode < 0.01
      ? 'Anatomical position · Front'
      : `Specimen sheet · ${COLLECTIONS.find((c) => c.id === collection)?.label ?? 'Full body'}`;

  return (
    <div className="explode-wrap">
      <div className="caption">{caption}</div>
      <section className="panel explode" aria-label="Explode anatomy">
        <div className="explode-main">
          <div className="explode-head">
            <span className="explode-title">
              <IconExplode size={14} />
              Explode anatomy
            </span>
            <span className="pct">{pct}%</span>
          </div>
          <input
            className="slider"
            type="range"
            min={0}
            max={1000}
            value={Math.round(explode * 1000)}
            aria-label="Explode anatomy"
            aria-valuetext={`${pct}%`}
            style={{ ['--fill' as string]: `${explode * 100}%` }}
            onPointerDown={() => (scrubbing.current = true)}
            onChange={(e) => setExplode(Number(e.target.value) / 1000, scrubbing.current)}
          />
          <div className="explode-ends">
            <button type="button" onClick={() => setExplode(0)}>
              Assembled
            </button>
            <button type="button" onClick={() => setExplode(1)}>
              Every piece
            </button>
          </div>
        </div>
        <span className="vdivider" />
        <button
          type="button"
          className="reset-btn"
          onClick={() => {
            setExplode(0);
            if (!useAtlas.getState().collection) setTimeout(resetCamera, 0);
          }}
        >
          Reset
        </button>
      </section>
    </div>
  );
}
