// The gallery chrome: exhibit title and readouts (top left), controls (top
// right), arrows either side, exhibit tabs along the bottom, and credits.
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EXHIBITS } from '../exhibits';
import { useLab } from '../state/store';
import { IconChevron, IconClose } from './icons';

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
} as const;

function useHashSync() {
  const index = useLab((s) => s.index);
  useEffect(() => {
    const fromHash = () => {
      const i = EXHIBITS.findIndex((e) => `#${e.id}` === location.hash);
      if (i >= 0 && i !== useLab.getState().index) useLab.getState().go(i);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  useEffect(() => {
    const hash = `#${EXHIBITS[index].id}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }, [index]);
}

function useArrowKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.isContentEditable)) return;
      const { index, go } = useLab.getState();
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
  useArrowKeys();
  const index = useLab((s) => s.index);
  const go = useLab((s) => s.go);
  const toggleCredits = useLab((s) => s.toggleCredits);
  const ex = EXHIBITS[index];
  const { Panel, Readouts } = ex;
  const n = String(index + 1).padStart(2, '0');

  return (
    <div className="shell">
      <AnimatePresence mode="wait">
        <motion.section key={ex.id} className="intro" {...fade}>
          <div className="eyebrow">
            Body Lab · Exhibit {n} / {String(EXHIBITS.length).padStart(2, '0')}
          </div>
          <h1 className="title">{ex.title}</h1>
          <p className="blurb">{ex.blurb}</p>
          <div className="readouts">
            <Readouts />
          </div>
        </motion.section>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.aside key={ex.id} className="controls panel" {...fade}>
          <Panel />
        </motion.aside>
      </AnimatePresence>

      <button type="button" className="arrow is-prev" aria-label="Previous exhibit" onClick={() => go(index - 1)}>
        <IconChevron style={{ transform: 'rotate(90deg)' }} size={22} />
      </button>
      <button type="button" className="arrow is-next" aria-label="Next exhibit" onClick={() => go(index + 1)}>
        <IconChevron style={{ transform: 'rotate(-90deg)' }} size={22} />
      </button>

      <nav className="tabs" aria-label="Exhibits">
        {EXHIBITS.map((e, i) => (
          <button key={e.id} type="button" className={`tab${i === index ? ' is-active' : ''}`} aria-current={i === index} onClick={() => go(i)}>
            {i === index && <motion.span layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
            <span className="tab-num">{String(i + 1).padStart(2, '0')}</span>
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
