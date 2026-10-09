import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { GROUP_STYLE, REGION_BY_ID } from '../data/regions';
import { rig } from '../scene/rig';
import { useBrain } from '../state/store';
import type { Mode } from '../state/store';
import { Segmented } from './controls';
import { IconClose, IconLayers, IconMinus, IconOrbit, IconPeel, IconPlus, IconReset, IconSkull } from './icons';
import { Legend, RightPanel, ScenarioPanel, StatePanel } from './Panels';
import { Timeline } from './Timeline';
import { tooltip } from './tooltipBus';

function Tooltip() {
  const h = useBrain((s) => s.hovered);
  const region = h?.region ? REGION_BY_ID[h.region] : null;
  return (
    <div className="tooltip-anchor" ref={tooltip.bind} aria-hidden>
      <AnimatePresence>
        {h && (
          <motion.div key="tip" className="tooltip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <div className="tooltip-name">{region ? region.label : h.name.replace(/, nsn$/, '')}</div>
            <div className="tooltip-cat">
              {region ? (
                <>
                  <span className="bullet" style={{ background: GROUP_STYLE[region.group].color }} /> {region.role}
                </>
              ) : (
                'Brain structure · not part of these scenarios'
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Toolbar() {
  const skull = useBrain((s) => s.skull);
  const peel = useBrain((s) => s.peel);
  const autoRotate = useBrain((s) => s.autoRotate);
  const toggle = useBrain((s) => s.toggle);
  const btn = (label: string, on: boolean | undefined, onClick: () => void, icon: React.ReactNode) => (
    <button type="button" className={`tool${on ? ' is-active' : ''}`} aria-label={label} aria-pressed={on} data-tip={label} onClick={onClick}>
      {icon}
    </button>
  );
  return (
    <nav className="toolbar" aria-label="View">
      {btn('Zoom in', undefined, () => rig.zoom(0.75), <IconPlus />)}
      {btn('Zoom out', undefined, () => rig.zoom(1.33), <IconMinus />)}
      {btn('Reset view', undefined, () => rig.home(), <IconReset />)}
      <span className="tool-sep" />
      {btn('Auto-rotate', autoRotate, () => toggle('autoRotate'), <IconOrbit />)}
      {btn('Peel back cortex', peel, () => toggle('peel'), <IconPeel />)}
      {btn('Show skull', skull, () => toggle('skull'), <IconSkull />)}
    </nav>
  );
}

function Credits() {
  const open = useBrain((s) => s.creditsOpen);
  return (
    <AnimatePresence>
      {open && (
        <motion.aside className="panel credits" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22 }}>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={() => useBrain.getState().toggle('creditsOpen')}>
            <IconClose size={14} />
          </button>
          <div className="eyebrow-caps">Sources &amp; credits</div>
          <h3>About this model</h3>
          <p>
            Brain and skull meshes: <strong>BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by CC表示-継承2.1 日本</strong>{' '}
            (Database Center for Life Science, CC BY-SA 2.1 JP), via Human Atlas.{' '}
            <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noreferrer">
              License
            </a>
            .
          </p>
          <h4>How to read the simulation</h4>
          <p>
            Timings and intensities are illustrative. They follow typical latencies from the cited studies, but real brains vary,
            regions work in overlapping networks, and functional areas are shown on the nearest anatomical structure. The “fast”
            and “slow” systems are a useful description, not two separate brains.
          </p>
          <p>Every claim carries an evidence rating and its source. Educational use only; not medical or psychological advice.</p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function Overlay() {
  const ready = useBrain((s) => s.ready);
  const mode = useBrain((s) => s.mode);
  const sheetOpen = useBrain((s) => s.sheetOpen);
  const { setMode, toggle } = useBrain.getState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, select, textarea')) return;
      const st = useBrain.getState();
      if (e.key === ' ' && st.mode === 'simulate') {
        e.preventDefault();
        if (st.playing) st.pause();
        else st.play();
      } else if (e.key === 'Escape') {
        if (st.creditsOpen) st.toggle('creditsOpen');
        else st.selectRegion(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div className={`overlay mode-${mode}`} initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0.5 }} transition={{ duration: 0.6 }}>
      <header className="brand">
        <div className="eyebrow-caps">Neuroscience of reaction</div>
        <h1>Two-Speed Brain</h1>
        <div className="brand-meta">Why feelings arrive before reasons</div>
      </header>

      <div className="mode-tabs">
        <Segmented<Mode>
          id="mode"
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'simulate', label: 'Simulate' },
            { value: 'trainer', label: 'Pause trainer' },
            { value: 'evidence', label: 'Myths & evidence' },
          ]}
        />
      </div>

      <div className={`left-column${sheetOpen ? ' is-open' : ''}`}>
        <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={() => toggle('sheetOpen')}>
          <IconClose size={14} />
        </button>
        <ScenarioPanel />
        <StatePanel />
      </div>
      <button type="button" className="layers-btn" onClick={() => toggle('sheetOpen')}>
        <IconLayers size={15} />
        Scenarios &amp; state
      </button>

      <RightPanel />
      <Toolbar />
      {mode === 'simulate' && <Timeline />}
      <Legend />
      <Tooltip />
      <Credits />
      {!ready && <div className="loading">Loading brain…</div>}
      <button type="button" className="credits-link" onClick={() => toggle('creditsOpen')}>
        Sources &amp; credits
      </button>
    </motion.div>
  );
}
