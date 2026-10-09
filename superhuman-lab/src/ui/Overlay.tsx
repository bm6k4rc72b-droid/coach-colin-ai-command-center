import { AnimatePresence, motion } from 'framer-motion';
import { GENES } from '../data/genes';
import { rig } from '../scene/rig';
import { useLab } from '../state/store';
import type { View } from '../state/store';
import { Segmented } from './controls';
import { IconClose, IconLayers, IconMinus, IconOrbit, IconPlus, IconReset } from './icons';
import { FictionDial, GeneLibrary, RightPanel } from './Panels';
import { tooltip } from './tooltipBus';

const titleCase = (n: string) =>
  n
    .replace(/, nsn$/, '')
    .split(' ')
    .map((w, i) => (i > 0 && ['of', 'and', 'the'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

function Tooltip() {
  const h = useLab((s) => s.hovered);
  const active = useLab((s) => s.active);
  const genes = h ? GENES.filter((g) => active.includes(g.id) && g.visual.systems.includes(h.system as never)) : [];
  return (
    <div className="tooltip-anchor" ref={tooltip.bind} aria-hidden>
      <AnimatePresence>
        {h && (
          <motion.div key="tip" className="tooltip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <div className="tooltip-name">{titleCase(h.name)}</div>
            <div className="tooltip-cat">{genes.length ? `Changed by ${genes.map((g) => g.symbol).join(', ')}` : 'Unmodified'}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Toolbar() {
  const autoRotate = useLab((s) => s.autoRotate);
  const toggle = useLab((s) => s.toggle);
  return (
    <nav className="toolbar" aria-label="View">
      <button type="button" className="tool" aria-label="Zoom in" data-tip="Zoom in" onClick={() => rig.zoom(0.72)}>
        <IconPlus />
      </button>
      <button type="button" className="tool" aria-label="Zoom out" data-tip="Zoom out" onClick={() => rig.zoom(1.38)}>
        <IconMinus />
      </button>
      <button type="button" className="tool" aria-label="Reset view" data-tip="Reset view" onClick={() => rig.home()}>
        <IconReset />
      </button>
      <span className="tool-sep" />
      <button type="button" className={`tool${autoRotate ? ' is-active' : ''}`} aria-pressed={autoRotate} aria-label="Turntable" data-tip="Turntable" onClick={() => toggle('autoRotate')}>
        <IconOrbit />
      </button>
    </nav>
  );
}

function Credits() {
  const open = useLab((s) => s.creditsOpen);
  return (
    <AnimatePresence>
      {open && (
        <motion.aside className="panel credits" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22 }}>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={() => useLab.getState().toggle('creditsOpen')}>
            <IconClose size={14} />
          </button>
          <div className="eyebrow-caps">Sources &amp; credits</div>
          <h3>About the lab</h3>
          <p>
            Body meshes: <strong>BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by CC表示-継承2.1 日本</strong>{' '}
            (Database Center for Life Science, CC BY-SA 2.1 JP), via Human Atlas.{' '}
            <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noreferrer">
              License
            </a>
            .
          </p>
          <h4>Real vs fiction</h4>
          <p>
            Each gene card describes a real variant and cites the studies behind it. On the body, real effects are shown as
            gentle, illustrative changes: growth for muscle and bone, a glow for systems that work differently. The
            Reality ↔ Fiction dial exaggerates those visuals for fun and labels everything past zero as not real.
          </p>
          <p className="fine">Educational and entertainment use. Not medical or genetic advice.</p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function Overlay() {
  const ready = useLab((s) => s.ready);
  const view = useLab((s) => s.view);
  const sheetOpen = useLab((s) => s.sheetOpen);
  const { setView, toggle } = useLab.getState();
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0.5 }} transition={{ duration: 0.6 }}>
      <header className="brand">
        <div className="eyebrow-caps">Gene lab · fiction on real science</div>
        <h1>Superhuman</h1>
        <div className="brand-meta">Build a being from real human gene variants</div>
      </header>
      <div className="mode-tabs">
        <Segmented<View>
          id="view"
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'body', label: 'Body' },
            { value: 'skeleton', label: 'Skeleton' },
            { value: 'organs', label: 'Organs' },
          ]}
        />
      </div>
      <div className={`left-column${sheetOpen ? ' is-open' : ''}`}>
        <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={() => toggle('sheetOpen')}>
          <IconClose size={14} />
        </button>
        <GeneLibrary />
      </div>
      <button type="button" className="layers-btn" onClick={() => toggle('sheetOpen')}>
        <IconLayers size={15} />
        Gene library
      </button>
      <RightPanel />
      <Toolbar />
      <FictionDial />
      <Tooltip />
      <Credits />
      {!ready && <div className="loading">Loading body…</div>}
      <div className="hint">Drag to orbit · Scroll to zoom · Click a glowing part</div>
      <button type="button" className="credits-link" onClick={() => toggle('creditsOpen')}>
        Sources &amp; credits
      </button>
    </motion.div>
  );
}
