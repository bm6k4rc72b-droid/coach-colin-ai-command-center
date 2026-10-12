// The gallery chrome. Three states share one layout:
//  · Explore: the whole body, with layers and the exhibit hotspots;
//  · An exhibit in the body: its physiology runs on the real organs;
//  · An exhibit on the bench: the apparatus on its plinth.
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SYSTEM_COLOR, SYSTEM_LABEL, exhibitFor } from '../body/registry';
import { EXHIBITS } from '../exhibits';
import { useLab, type Layer } from '../state/store';
import type { AtlasPiece } from '../types';
import { Toggle } from './controls';
import { IconBone, IconChevron, IconClose } from './icons';
import { Group } from './kit';
import { tooltip } from './tooltipBus';

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
} as const;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number) => String(n).padStart(2, '0');

function hashFor(index: number | null, view: string) {
  if (index === null) return '#explore';
  return `#${EXHIBITS[index].id}${view === 'bench' ? '/bench' : ''}`;
}

function useHashSync() {
  const index = useLab((s) => s.index);
  const view = useLab((s) => s.view);
  useEffect(() => {
    const fromHash = () => {
      const [id, mode] = location.hash.slice(1).split('/');
      const i = EXHIBITS.findIndex((e) => e.id === id);
      const st = useLab.getState();
      if (i < 0) {
        if (st.index !== null || st.view !== 'body') useLab.setState({ index: null, view: 'body' });
        return;
      }
      useLab.setState({ index: i, view: mode === 'bench' ? 'bench' : 'body' });
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  useEffect(() => {
    const hash = hashFor(index, view);
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }, [index, view]);
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.isContentEditable)) return;
      const { index, go, select, selected, view } = useLab.getState();
      if (e.key === 'ArrowRight') go(index === null ? 0 : index + 1);
      else if (e.key === 'ArrowLeft') go(index === null ? EXHIBITS.length - 1 : index - 1);
      else if (e.key === 'Escape') {
        if (selected) select(null);
        else if (view === 'bench') useLab.getState().setView('body');
        else go(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Tooltip() {
  const h = useLab((s) => s.hovered);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => tooltip.bind(ref.current), []);
  return (
    <div className="tooltip-anchor" ref={ref} aria-hidden>
      {h && (
        <div className="tooltip">
          <div className="tooltip-name">{titleCase(h.name)}</div>
          <div className="tooltip-sys">
            <span className="swatch" style={{ background: SYSTEM_COLOR[h.system] }} />
            {SYSTEM_LABEL[h.system]}
          </div>
        </div>
      )}
    </div>
  );
}

const LAYERS: { id: Layer; label: string; color: string }[] = [
  { id: 'skeleton', label: 'Skeleton', color: SYSTEM_COLOR.skeleton },
  { id: 'muscles', label: 'Muscles', color: SYSTEM_COLOR.muscles },
  { id: 'organs', label: 'Organs', color: SYSTEM_COLOR.viscera },
  { id: 'nervous', label: 'Brain & senses', color: SYSTEM_COLOR.nervous },
  { id: 'vessels', label: 'Blood vessels', color: SYSTEM_COLOR.arteries },
];

function ExplorePanel() {
  const layers = useLab((s) => s.layers);
  const xray = useLab((s) => s.xray);
  const go = useLab((s) => s.go);
  return (
    <>
      <Group title="Layers">
        {LAYERS.map((l) => (
          <div key={l.id} className="row layer-row">
            <span className="layer-name">
              <span className="swatch" style={{ background: l.color }} />
              {l.label}
              {l.id === 'muscles' && <span className="layer-note">5 MB</span>}
            </span>
            <Toggle label={l.label} on={layers[l.id]} onChange={() => useLab.getState().toggleLayer(l.id)} />
          </div>
        ))}
        <div className="row layer-row">
          <span className="layer-name">
            <IconBone />
            X-ray
          </span>
          <Toggle label="X-ray" on={xray} onChange={(v) => useLab.getState().setXray(v)} />
        </div>
      </Group>
      <Group title="Exhibits">
        <div className="exhibit-list">
          {EXHIBITS.map((e, i) => (
            <button key={e.id} type="button" className="exhibit-link" onClick={() => go(i)}>
              <span className="tab-num">{pad(i + 1)}</span>
              {e.title.replace(/^The /, '')}
              <IconChevron style={{ transform: 'rotate(-90deg)' }} />
            </button>
          ))}
        </div>
      </Group>
    </>
  );
}

function ViewSwitch() {
  const view = useLab((s) => s.view);
  const setView = useLab((s) => s.setView);
  const go = useLab((s) => s.go);
  return (
    <div className="button-row view-switch">
      <button type="button" className={`btn${view === 'body' ? ' is-on' : ''}`} onClick={() => setView('body')}>
        In the body
      </button>
      <button type="button" className={`btn${view === 'bench' ? ' is-on' : ''}`} onClick={() => setView('bench')}>
        On the bench
      </button>
      <button type="button" className="btn icon-only" aria-label="Back to the whole body" title="Whole body" onClick={() => go(null)}>
        <IconClose />
      </button>
    </div>
  );
}

function PieceCard() {
  const sel = useLab((s) => s.selected);
  const view = useLab((s) => s.view);
  if (!sel || view !== 'body') return null;
  const ex = exhibitFor({ name: sel.name, system: sel.system } as AtlasPiece);
  return (
    <motion.div key={sel.id} className="piece-card panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <button type="button" className="icon-button piece-close" aria-label="Clear selection" onClick={() => useLab.getState().select(null)}>
        <IconClose />
      </button>
      <div className="tile-label">
        <span className="swatch" style={{ background: SYSTEM_COLOR[sel.system] }} />
        {SYSTEM_LABEL[sel.system]}
      </div>
      <div className="piece-name">{titleCase(sel.name)}</div>
      {ex !== null && (
        <button type="button" className="btn is-primary" onClick={() => useLab.getState().go(ex)}>
          Open exhibit {pad(ex + 1)} · {EXHIBITS[ex].title.replace(/^The /, '')}
        </button>
      )}
    </motion.div>
  );
}

function Credits() {
  const open = useLab((s) => s.creditsOpen);
  const toggle = useLab((s) => s.toggleCredits);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="credits-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={toggle}>
          <motion.div
            className="credits panel"
            role="dialog"
            aria-label="Credits and sources"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="icon-button credits-close" aria-label="Close" onClick={toggle}>
              <IconClose />
            </button>
            <h2>Credits &amp; sources</h2>
            <p>
              Anatomy: <strong>BodyParts3D</strong>, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by
              CC表示-継承2.1 日本 (Database Center for Life Science, CC BY-SA 2.1 JP), via Human Atlas.
            </p>
            {EXHIBITS.map((e) => (
              <div key={e.id} className="credits-block">
                <h3>{e.title}</h3>
                <ul>
                  {e.sources.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="muted">
              Each exhibit is a teaching model built on published numbers, simplified so it can run live. Educational
              only, not medical advice.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Shell() {
  useHashSync();
  useKeys();
  const index = useLab((s) => s.index);
  const view = useLab((s) => s.view);
  const ready = useLab((s) => s.ready);
  const go = useLab((s) => s.go);
  const toggleCredits = useLab((s) => s.toggleCredits);
  const ex = index === null ? null : EXHIBITS[index];
  const key = `${ex?.id ?? 'explore'}`;

  return (
    <div className="shell">
      <Tooltip />
      <AnimatePresence mode="wait">
        <motion.section key={key} className="intro" {...fade}>
          {ex ? (
            <>
              <div className="eyebrow">
                Body Lab · Exhibit {pad(index! + 1)} / {pad(EXHIBITS.length)}
                <span className="eyebrow-mode"> · {view === 'body' ? 'in the body' : 'on the bench'}</span>
              </div>
              <h1 className="title">{ex.title}</h1>
              <p className="blurb">{ex.blurb}</p>
              <div className="readouts">
                <ex.Readouts />
              </div>
            </>
          ) : (
            <>
              <div className="eyebrow">Body Lab · Explore</div>
              <h1 className="title">The Human Body</h1>
              <p className="blurb">
                Nearly 900 real structures from BodyParts3D. Drag to turn, scroll or pinch to zoom, right-drag to pan.
                Hover anything to name it, click to select it, and open a glowing number to watch that part of the body
                work.
              </p>
              {!ready && <div className="loading">Loading anatomy…</div>}
            </>
          )}
        </motion.section>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.aside key={key} className="controls panel" {...fade}>
          {ex ? (
            <>
              <ViewSwitch />
              <ex.Panel />
            </>
          ) : (
            <ExplorePanel />
          )}
        </motion.aside>
      </AnimatePresence>

      <AnimatePresence>
        <PieceCard />
      </AnimatePresence>

      <button type="button" className="arrow is-prev" aria-label="Previous exhibit" onClick={() => go(index === null ? EXHIBITS.length - 1 : index - 1)}>
        <IconChevron style={{ transform: 'rotate(90deg)' }} size={22} />
      </button>
      <button type="button" className="arrow is-next" aria-label="Next exhibit" onClick={() => go(index === null ? 0 : index + 1)}>
        <IconChevron style={{ transform: 'rotate(-90deg)' }} size={22} />
      </button>

      <nav className="tabs" aria-label="Exhibits">
        <button type="button" className={`tab${index === null ? ' is-active' : ''}`} aria-current={index === null} onClick={() => go(null)}>
          {index === null && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
          <span className="tab-num">00</span>
          <span className="tab-label">Body</span>
        </button>
        {EXHIBITS.map((e, i) => (
          <button key={e.id} type="button" className={`tab${i === index ? ' is-active' : ''}`} aria-current={i === index} onClick={() => go(i)}>
            {i === index && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
            <span className="tab-num">{pad(i + 1)}</span>
            <span className="tab-label">{e.title.replace(/^The /, '')}</span>
          </button>
        ))}
      </nav>

      <button type="button" className="credits-button" onClick={toggleCredits}>
        Credits &amp; sources
      </button>
      <Credits />
    </div>
  );
}
